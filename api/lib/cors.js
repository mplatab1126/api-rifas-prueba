/**
 * Helper central para aplicar headers CORS a los endpoints.
 *
 * SEGURIDAD: Antes aceptaba peticiones desde cualquier dominio del mundo
 * (Access-Control-Allow-Origin: *). Ahora solo acepta peticiones desde
 * los dominios listados en ORIGENES_PERMITIDOS y desde localhost
 * (para pruebas locales de Mateo).
 *
 * Las peticiones servidor-a-servidor (ChateaPro, Twilio, crons de Vercel)
 * NO llegan con header Origin y pasan sin bloqueo, porque CORS es una
 * proteccion del navegador, no del servidor.
 *
 * Si algun dia cambias de dominio, solo tienes que agregarlo a la lista
 * ORIGENES_PERMITIDOS de abajo.
 *
 * Uso basico:
 *
 *   import { aplicarCors } from '../lib/cors.js';
 *
 *   export default async function handler(req, res) {
 *     if (aplicarCors(req, res, 'OPTIONS,POST')) return;
 *     // ... resto del codigo
 *   }
 *
 * @param {object} req - Request de Vercel
 * @param {object} res - Response de Vercel
 * @param {string} metodos - Metodos permitidos (ej: 'OPTIONS,POST' o 'GET,OPTIONS,POST')
 * @param {string|null} headersPermitidos - Headers permitidos extra. Opcional.
 * @returns {boolean} true si la peticion ya fue respondida (el handler debe salir)
 */

// Lista blanca de dominios permitidos (produccion)
const ORIGENES_PERMITIDOS = [
  'https://www.losplata.com.co',
  'https://losplata.com.co',
];

function esOrigenPermitido(origin) {
  if (!origin) return false;
  if (ORIGENES_PERMITIDOS.includes(origin)) return true;
  // Localhost en cualquier puerto (para pruebas locales)
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
}

export function aplicarCors(req, res, metodos = 'OPTIONS,POST', headersPermitidos = null) {
  const origin = req.headers.origin;
  const permitido = esOrigenPermitido(origin);

  // Si la peticion viene de un navegador (tiene Origin) y el origen NO
  // esta permitido, bloqueamos antes de ejecutar la logica del endpoint.
  // Las peticiones servidor-a-servidor (sin Origin) siguen pasando.
  if (origin && !permitido) {
    res.status(403).json({ status: 'error', mensaje: 'Origen no permitido' });
    return true;
  }

  if (permitido) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', metodos);
    res.setHeader('Access-Control-Allow-Headers', headersPermitidos || 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
