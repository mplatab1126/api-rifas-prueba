/**
 * Helper central para aplicar headers CORS a los endpoints.
 *
 * Antes, cada endpoint tenia ~4 lineas repetidas para configurar CORS
 * y manejar el preflight OPTIONS. Ahora se hace con una sola llamada.
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
 * Uso con headers personalizados (ej: permisos.js, horarios.js):
 *
 *   if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
 *
 * @param {object} req - Request de Vercel
 * @param {object} res - Response de Vercel
 * @param {string} metodos - Metodos permitidos (ej: 'OPTIONS,POST' o 'GET,OPTIONS,POST')
 * @param {string|null} headersPermitidos - Headers permitidos (ej: 'Content-Type'). Opcional.
 * @returns {boolean} true si era una peticion OPTIONS (el handler debe salir)
 */
export function aplicarCors(req, res, metodos = 'OPTIONS,POST', headersPermitidos = null) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', metodos);

  if (headersPermitidos) {
    res.setHeader('Access-Control-Allow-Headers', headersPermitidos);
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
