/**
 * Importa una lista de contactos a una línea (carga por lotes, escalable).
 * El navegador parsea el archivo y manda los contactos por bloques.
 *
 * Recibe (POST, JSON): { contrasena, linea_id, contactos: [{ nombre, telefono, correo }] }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';
import { normalizarTel } from './contacto-crear.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, contactos } = req.body || {};
  const asesor = validarAsesor(contrasena);
  if (!asesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (linea_id && !(await puedeVerLinea(asesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }
  if (!Array.isArray(contactos) || contactos.length === 0) {
    return res.status(400).json({ status: 'error', mensaje: 'No hay contactos para importar.' });
  }

  // Normalizar + quedarnos con teléfonos válidos, sin repetir
  const porTelefono = new Map();
  for (const c of contactos) {
    const tel = normalizarTel(c && c.telefono);
    if (!tel || tel.length < 7) continue;
    porTelefono.set(tel, {
      telefono: tel,
      linea_id: linea_id || null,
      nombre_perfil: (c.nombre && String(c.nombre).trim()) || null,
      correo: (c.correo && String(c.correo).trim()) || null,
    });
  }
  const filas = [...porTelefono.values()];
  if (filas.length === 0) {
    return res.status(200).json({ status: 'ok', importados: 0, mensaje: 'Ningún teléfono válido en el bloque.' });
  }

  // Upsert por sub-lotes (no pisa mensajes ni datos existentes salvo nombre/correo)
  let importados = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .upsert(lote, { onConflict: 'linea_id,telefono' });
    if (error) return res.status(200).json({ status: 'error', mensaje: error.message, importados });
    importados += lote.length;
  }

  return res.status(200).json({ status: 'ok', importados });
}
