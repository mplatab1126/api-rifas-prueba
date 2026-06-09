/**
 * Lista los COMPROBANTES que mandan los clientes (las fotos entrantes) de una línea,
 * con su estado: ✅ asignado (ya se usó para un abono) o ⏳ sin asignar.
 *
 * Sirve para que el asesor vea de un vistazo qué pagos llegaron y cuáles todavía
 * no se han registrado, y pueda saltar a la conversación de cada uno.
 *
 * Todo el filtrado y la paginación van EN EL SERVIDOR (escala: líneas con miles de
 * mensajes no se traen enteras al navegador). El "asignado" sale de raw.pago_asignado,
 * que se escribe cuando se registra un abono desde esa foto (Liliana o abono manual).
 * OJO: solo marca de aquí en adelante; los comprobantes viejos salen "sin asignar".
 *
 * Recibe (POST, JSON): { contrasena, linea_id, offset?, limit?, solo_sin_asignar? }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, offset = 0, limit = 30, solo_sin_asignar = false } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  const off = Math.max(0, parseInt(offset, 10) || 0);
  const lim = Math.min(60, Math.max(1, parseInt(limit, 10) || 30));

  // Fotos entrantes (comprobantes) de esta línea, de la más nueva a la más vieja.
  // Pedimos una de más (lim+1) para saber si hay página siguiente.
  let q = supabaseAdmin
    .from('mensajes_whatsapp')
    .select('id, conversacion_id, telefono, media_id, timestamp_wa, raw')
    .eq('linea_id', linea_id)
    .eq('direccion', 'entrante')
    .eq('tipo', 'image')
    .order('timestamp_wa', { ascending: false })
    .range(off, off + lim);   // lim+1 filas
  if (solo_sin_asignar) q = q.is('raw->pago_asignado', null);

  const { data: msgs, error } = await q;
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  const filas = (msgs || []).slice(0, lim);
  const hayMas = (msgs || []).length > lim;

  // Nombres de los clientes (por teléfono, en esta línea) en una sola consulta.
  const tels = [...new Set(filas.map(m => m.telefono).filter(Boolean))];
  const nombres = {};
  if (tels.length) {
    const { data: convs } = await supabaseAdmin
      .from('conversaciones_whatsapp')
      .select('telefono, nombre_perfil')
      .eq('linea_id', linea_id)
      .in('telefono', tels);
    for (const c of (convs || [])) nombres[c.telefono] = c.nombre_perfil || '';
  }

  const items = filas.map(m => ({
    media_id: m.media_id,
    telefono: m.telefono,
    nombre: nombres[m.telefono] || '',
    timestamp_wa: m.timestamp_wa,
    asignado: !!(m.raw && m.raw.pago_asignado),
    pago_asignado: (m.raw && m.raw.pago_asignado) || null,
  }));

  return res.status(200).json({ status: 'ok', items, hay_mas: hayMas, offset: off, limit: lim });
}
