/**
 * Endpoint para generar transcripciones de videos ganadores.
 *
 * POST /api/contenido/transcribir
 * Body: {
 *   contrasena,
 *   adsVideos:     [{ id, videoId, videoUrl, name, purchases, spend }],
 *   organicVideos: [{ id, mediaUrl, title, social, interactions }]
 * }
 *
 * Para ads: usa videoUrl si ya viene del Sync. Si no, intenta obtenerla
 * desde la API de Meta con el videoId.
 * Para orgánico: usa mediaUrl directamente.
 *
 * Usa OpenAI Whisper (whisper-1) para transcribir el audio.
 * Variables requeridas: OPENAI_API_KEY, CONTENIDO_META_TOKEN, CONTENIDO_AD_ACCOUNT_ID
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v19.0';
const META_TOKEN = process.env.CONTENIDO_META_TOKEN;
const AD_ACCOUNT_ID = process.env.CONTENIDO_AD_ACCOUNT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
// Whisper acepta hasta 25 MB, pero el envelope multipart añade ~500 bytes de overhead.
// Descargamos hasta 24 MB para quedar bien por debajo del límite.
const MAX_SIZE_BYTES = 24 * 1024 * 1024; // 24 MB
const ACCESO_PERMITIDO = ['mateo', 'alejo p', 'alejo plata', 'valeria'];

/**
 * Intenta obtener la URL de descarga de un video de Meta por varias vías.
 * Retorna { url } o { error }.
 * @param {string} videoId  - ID del video en Meta
 * @param {string} [adId]   - ID del anuncio (opcional, habilita intento extra vía post)
 */
async function getMetaVideoUrl(videoId, adId) {
  const log = []; // acumula detalles para debug en el mensaje de error

  // Intento 1: endpoint directo del video (requiere video_upload en el token)
  try {
    const r = await fetch(`${GRAPH}/${videoId}?fields=source&access_token=${META_TOKEN}`);
    const json = await r.json();
    if (!json.error && json.source) return { url: json.source };
    log.push(`v1:${json.error?.code ?? 'sin_source'}`);
  } catch (e) { log.push(`v1:exc`); }

  // Intento 2: via librería de videos con parámetro video_ids
  if (AD_ACCOUNT_ID) {
    try {
      const r = await fetch(
        `${GRAPH}/act_${AD_ACCOUNT_ID}/advideos?video_ids=${videoId}&fields=id,source&access_token=${META_TOKEN}`
      );
      const json = await r.json();
      const found = (json.data || []).find((v) => String(v.id) === String(videoId));
      if (found?.source) return { url: found.source };
      log.push(`v2:${json.error?.code ?? (json.data?.length === 0 ? 'empty' : 'no_source')}`);
    } catch (e) { log.push(`v2:exc`); }
  }

  // Intento 3: via librería con filtering URL-encoded
  if (AD_ACCOUNT_ID) {
    try {
      const filterStr = encodeURIComponent(
        JSON.stringify([{ field: 'id', operator: 'EQUAL', value: videoId }])
      );
      const r = await fetch(
        `${GRAPH}/act_${AD_ACCOUNT_ID}/advideos?fields=id,source&filtering=${filterStr}&access_token=${META_TOKEN}`
      );
      const json = await r.json();
      const found = (json.data || []).find((v) => String(v.id) === String(videoId));
      if (found?.source) return { url: found.source };
      log.push(`v3:${json.error?.code ?? (json.data?.length === 0 ? 'empty' : 'no_source')}`);
    } catch (e) { log.push(`v3:exc`); }
  }

  // Intento 4: via post del anuncio → effective_object_story_id → attachments
  if (adId) {
    try {
      const r1 = await fetch(
        `${GRAPH}/${adId}?fields=creative%7Beffective_object_story_id%7D&access_token=${META_TOKEN}`
      );
      const j1 = await r1.json();
      const storyId = j1?.creative?.effective_object_story_id;
      if (storyId) {
        const r2 = await fetch(
          `${GRAPH}/${storyId}?fields=attachments%7Bmedia%7D&access_token=${META_TOKEN}`
        );
        const j2 = await r2.json();
        const source = j2?.attachments?.data?.[0]?.media?.source;
        if (source) return { url: source };
        log.push(`v4:story=${storyId},err=${j2.error?.code ?? 'no_source'}`);
      } else {
        log.push(`v4:no_story(${j1.error?.code ?? 'ok'})`);
      }
    } catch (e) { log.push(`v4:exc`); }
  }

  // Intento 5: via Instagram media ID del creativo → media_url (misma vía que orgánicos)
  if (adId) {
    try {
      const r1 = await fetch(
        `${GRAPH}/${adId}?fields=creative%7Beffective_instagram_media_id%7D&access_token=${META_TOKEN}`
      );
      const j1 = await r1.json();
      const igMediaId = j1?.creative?.effective_instagram_media_id;
      if (igMediaId) {
        const r2 = await fetch(
          `${GRAPH}/${igMediaId}?fields=media_url,media_type&access_token=${META_TOKEN}`
        );
        const j2 = await r2.json();
        if (j2?.media_type === 'VIDEO' && j2?.media_url) return { url: j2.media_url };
        log.push(`v5:ig=${igMediaId},type=${j2.media_type ?? '?'},err=${j2.error?.code ?? 'no_url'}`);
      } else {
        log.push(`v5:no_ig_id(${j1.error?.code ?? 'ok'})`);
      }
    } catch (e) { log.push(`v5:exc`); }
  }

  return { error: `Meta no devolvió URL del video [${log.join(' | ')}]. Token puede necesitar video_upload.` };
}

/** Descarga un video desde una URL y lo transcribe con Whisper */
async function transcribir(videoUrl) {
  let buffer;
  try {
    // Usar Range para limitar la descarga a 25 MB.
    // Los videos de Instagram/Meta son MP4 faststart (moov atom al inicio),
    // por lo que el fragmento inicial es un archivo válido que Whisper puede procesar.
    const res = await fetch(videoUrl, {
      headers: { Range: `bytes=0-${MAX_SIZE_BYTES - 1}` },
    });
    // 200 OK (servidor ignoró Range) o 206 Partial Content son ambos válidos
    if (!res.ok && res.status !== 206) {
      return { error: `No se pudo descargar el video (HTTP ${res.status})` };
    }
    buffer = await res.arrayBuffer();
  } catch (e) {
    return { error: `Error de red al descargar: ${e.message}` };
  }

  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return { error: `El video pesa ${Math.round(buffer.byteLength / 1024 / 1024)} MB y el CDN no soportó descarga parcial` };
  }

  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'video/mp4' });
    formData.append('file', blob, 'video.mp4');
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    const whisperRes = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    const result = await whisperRes.json();
    if (result.error) return { error: result.error.message || 'Error de Whisper' };
    if (!result.text) return { error: 'Whisper no devolvió texto' };
    return { text: result.text.trim() };
  } catch (e) {
    return { error: `Error al llamar Whisper: ${e.message}` };
  }
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, adsVideos = [], organicVideos = [] } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
  if (!ACCESO_PERMITIDO.includes(nombreAsesor.toLowerCase().trim())) {
    return res.status(403).json({ status: 'error', mensaje: 'Acceso restringido' });
  }
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ status: 'error', mensaje: 'Falta OPENAI_API_KEY en las variables de entorno de Vercel' });
  }

  const topAds = adsVideos.slice(0, 3);
  const topOrganic = organicVideos.slice(0, 3);

  const [adsResults, organicResults] = await Promise.all([
    Promise.all(topAds.map(async (ad) => {
      // Usar videoUrl del Sync si está disponible; si no, pedirla a Meta
      let videoUrl = ad.videoUrl || null;
      if (!videoUrl && ad.videoId) {
        const fetched = await getMetaVideoUrl(ad.videoId, ad.id);
        if (fetched.error) {
          return { id: ad.id, name: ad.name, purchases: ad.purchases, spend: ad.spend, transcription: null, error: fetched.error };
        }
        videoUrl = fetched.url;
      }
      if (!videoUrl) {
        return { id: ad.id, name: ad.name, purchases: ad.purchases, spend: ad.spend, transcription: null, error: 'Sin URL de video — haz Sync para refrescar los datos' };
      }
      const result = await transcribir(videoUrl);
      return {
        id: ad.id,
        name: ad.name,
        purchases: ad.purchases,
        spend: ad.spend,
        transcription: result.text || null,
        error: result.error || null,
      };
    })),

    Promise.all(topOrganic.map(async (post) => {
      if (!post.mediaUrl) {
        return { id: post.id, title: post.title, social: post.social, interactions: post.interactions, transcription: null, error: 'Sin URL de video — haz Sync para refrescar los datos' };
      }
      const result = await transcribir(post.mediaUrl);
      return {
        id: post.id,
        title: post.title,
        social: post.social,
        interactions: post.interactions,
        transcription: result.text || null,
        error: result.error || null,
      };
    })),
  ]);

  return res.status(200).json({
    status: 'ok',
    ads: adsResults,
    organic: organicResults,
  });
}
