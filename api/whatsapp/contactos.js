/**
 * Lista los contactos de una línea (apartado Contactos de la bandeja).
 * Paginado y con buscador EN EL SERVIDOR (pensado para escala: 48k+ por línea).
 *
 * Recibe (POST, JSON): { contrasena, linea_id, q, page }
 *   q    - texto de búsqueda (nombre o teléfono). Opcional.
 *   page - página (de 0 en adelante). Opcional, default 0.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

const POR_PAGINA = 50;

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, q, page } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (linea_id && !(await puedeVerLinea(nombre, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  const p = Math.max(0, Number(page) || 0);
  const desde = p * POR_PAGINA;
  const hasta = desde + POR_PAGINA - 1;

  let query = supabase
    .from('conversaciones_whatsapp')
    .select('telefono, nombre_perfil, correo, ultimo_at', { count: 'exact' })
    .order('nombre_perfil', { ascending: true, nullsFirst: false })
    .range(desde, hasta);
  if (linea_id) query = query.eq('linea_id', linea_id);

  const filtro = String(q || '').trim();
  if (filtro) {
    const soloDigitos = filtro.replace(/\D/g, '');
    if (soloDigitos.length >= 3) query = query.ilike('telefono', `%${soloDigitos}%`);
    else query = query.ilike('nombre_perfil', `%${filtro}%`);
  }

  const { data, count, error } = await query;
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  return res.status(200).json({
    status: 'ok',
    contactos: data || [],
    total: count || 0,
    page: p,
    porPagina: POR_PAGINA,
  });
}
