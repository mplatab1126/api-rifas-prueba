/**
 * Trae un archivo (foto, audio, etc.) que un cliente mandó por WhatsApp.
 *
 * Las fotos/audios NO vienen dentro del mensaje: Meta solo nos da un "ticket"
 * (media_id) y el archivo vive en sus servidores, protegido con el token. El
 * navegador no puede ir por él directo (expondría el token), así que este
 * endpoint lo trae por detrás (en dos pasos) y lo devuelve para mostrarlo.
 *
 * Recibe (POST, JSON): { contrasena, media_id }
 * Devuelve: el archivo binario con su tipo (imagen/audio/...).
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { configWhatsapp } from '../lib/whatsapp.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, media_id } = req.body || {};
  if (!validarAsesor(contrasena)) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!media_id) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el media_id.' });
  }

  const { token } = configWhatsapp();
  if (!token) {
    return res.status(200).json({ status: 'error', mensaje: 'Falta WHATSAPP_TOKEN en Vercel.' });
  }

  try {
    // Paso 1: pedirle a Meta la URL temporal del archivo
    const metaResp = await fetch(`https://graph.facebook.com/v21.0/${media_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const info = await metaResp.json();
    if (!info.url) {
      return res.status(200).json({ status: 'error', mensaje: info.error?.message || 'No se encontró el archivo.' });
    }

    // Paso 2: descargar los bytes (esa URL también requiere el token)
    const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) {
      return res.status(200).json({ status: 'error', mensaje: 'No se pudo descargar el archivo.' });
    }
    const buffer = Buffer.from(await bin.arrayBuffer());

    res.setHeader('Content-Type', info.mime_type || bin.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(200).json({ status: 'error', mensaje: err.message });
  }
}
