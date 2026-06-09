/**
 * Marca la FOTO de un comprobante del cliente como "pago asignado a la boleta NNNN".
 *
 * Lo llama la bandeja DESPUÉS de registrar un abono manual desde un comprobante
 * (clic derecho en la foto → "Buscar el pago" → "Abonar"). Escribe la marca en
 * `raw.pago_asignado` del mensaje (imagen entrante con ese media_id). La bandeja
 * muestra un chip verde "✅ Pago asignado" encima de la foto y la lista de
 * comprobantes la cuenta como asignada.
 *
 * NO toca dinero: solo agrega una etiqueta informativa al mensaje. Best-effort.
 *
 * Recibe (POST, JSON): { contrasena, media_id, linea_id, boleta, monto }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, media_id, linea_id, boleta, monto } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!media_id || !linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta el comprobante o la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  // Buscar el mensaje (la foto del comprobante) por su media_id en esta línea.
  const { data: msg } = await supabaseAdmin
    .from('mensajes_whatsapp')
    .select('id, raw')
    .eq('media_id', media_id)
    .eq('linea_id', linea_id)
    .order('timestamp_wa', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!msg) return res.status(200).json({ status: 'error', mensaje: 'No encontré ese comprobante.' });

  const raw = (msg.raw && typeof msg.raw === 'object') ? msg.raw : {};
  raw.pago_asignado = { boleta: String(boleta || ''), monto: Number(monto || 0), at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from('mensajes_whatsapp').update({ raw }).eq('id', msg.id);
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  return res.status(200).json({ status: 'ok' });
}
