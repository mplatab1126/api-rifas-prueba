import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).end();

  const { url, contrasena } = req.query;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ error: 'No autorizado' });

  if (!url || !url.includes('api.twilio.com')) {
    return res.status(400).json({ error: 'URL de grabación inválida' });
  }

  try {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'No se pudo obtener la grabación' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
