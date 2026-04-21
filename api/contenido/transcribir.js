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
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ACCESO_PERMITIDO = ['mateo', 'alejo p', 'alejo plata', 'valeria'];

/**
 * Intenta obtener la URL de descarga de un video de Meta por varias vías.
 * Retorna { url } o { error }.
 */
async function getMetaVideoUrl(videoId) {
  // Intento 1: endpoint directo del video
  try {
    const r = await fetch(`${GRAPH}/${videoId}?fields=source&access_token=${META_TOKEN}`);
    const json = await r.json();
    if (!json.error && json.source) return { url: json.source };
  } catch (e) { /* continuar */ }

  // Intento 2: via librería de videos de la cuenta publicitaria
  if (AD_ACCOUNT_ID) {
    try {
      const r = await fetch(
        `${GRAPH}/act_${AD_ACCOUNT_ID}/advideos?fields=id,source&filtering=[{"field":"id","operator":"EQUAL","value":"${videoId}"}]&access_token=${META_TOKEN}`
      );
      const json = await r.json();
      const found = (json.data || []).find((v) => v.id === videoId);
      if (found?.source) return { url: found.source };
    } catch (e) { /* continuar */ }
  }

  return { error: 'Meta no devolvió URL de descarga para este video. El token puede necesitar permiso video_upload.' };
}

/** Descarga un video desde una URL y lo transcribe con Whisper */
async function transcribir(videoUrl) {
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return { error: `No se pudo descargar el video (HTTP ${videoRes.status})` };
  } catch (e) {
    return { error: `Error de red al descargar: ${e.message}` };
  }

  const buffer = await videoRes.arrayBuffer();
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return { error: 'El video supera los 25 MB permitidos por Whisper' };
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
        const fetched = await getMetaVideoUrl(ad.videoId);
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
