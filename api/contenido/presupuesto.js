/**
 * Endpoint para actualizar el presupuesto diario de un conjunto de anuncios.
 *
 * POST /api/contenido/presupuesto
 * Body: { contrasena, adsetId, nuevoPresupuesto }
 *
 * Requiere ads_management en el token de Meta.
 * Acceso restringido a gerencia del Dashboard de Contenido.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v19.0';
const TOKEN = process.env.CONTENIDO_META_TOKEN;

const ACCESO_PERMITIDO = ['mateo', 'alejo p', 'alejo plata', 'valeria'];

// Presupuesto mínimo en COP (Meta exige mínimo ~$1 USD ≈ $4.000 COP)
const PRESUPUESTO_MINIMO = 4000;

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, adsetId, nuevoPresupuesto } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
  if (!ACCESO_PERMITIDO.includes(nombreAsesor.toLowerCase().trim())) {
    return res.status(403).json({ status: 'error', mensaje: 'Acceso restringido' });
  }

  if (!TOKEN) {
    return res.status(500).json({ status: 'error', mensaje: 'Falta CONTENIDO_META_TOKEN' });
  }

  if (!adsetId) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el ID del conjunto de anuncios' });
  }

  const budget = parseInt(nuevoPresupuesto);
  if (isNaN(budget) || budget < PRESUPUESTO_MINIMO) {
    return res.status(400).json({
      status: 'error',
      mensaje: `El presupuesto mínimo es $${PRESUPUESTO_MINIMO.toLocaleString('es-CO')} COP`,
    });
  }

  try {
    const r = await fetch(`${GRAPH}/${adsetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_budget: budget, access_token: TOKEN }),
    });

    const json = await r.json();

    if (json.error) {
      return res.status(400).json({
        status: 'error',
        mensaje: json.error.message || 'Error de Meta API',
        codigo: json.error.code,
      });
    }

    return res.status(200).json({
      status: 'ok',
      adsetId,
      nuevoPresupuesto: budget,
      mensaje: 'Presupuesto actualizado correctamente',
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', mensaje: err.message });
  }
}
