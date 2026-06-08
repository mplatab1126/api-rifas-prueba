/**
 * Lista las líneas de WhatsApp activas (para el selector de la bandeja).
 * NO devuelve los tokens (son secretos), solo nombre e identificador.
 *
 * Recibe (POST, JSON): { contrasena }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { esGerencia, esMateo, lineasDeAsesor } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }

  let query = supabase
    .from('lineas_whatsapp')
    .select('phone_number_id, nombre, suscrita')
    .eq('activa', true)
    .order('created_at', { ascending: true });

  // Gerencia ve todas; un asesor solo sus líneas asignadas
  if (!esGerencia(nombre)) {
    const permitidas = await lineasDeAsesor(nombre);
    if (!permitidas || permitidas.length === 0) {
      return res.status(200).json({ status: 'ok', lineas: [] });
    }
    query = query.in('phone_number_id', permitidas);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Marcar qué líneas tienen un agente activo (encendido/sombra) → su dueño verá el botón 🤖.
  const lineasOut = data || [];
  let conAgente = new Set();
  if (lineasOut.length) {
    const { data: cfgs } = await supabase
      .from('agente_config')
      .select('linea_id, estado')
      .in('linea_id', lineasOut.map(l => l.phone_number_id))
      .neq('estado', 'apagado');
    conAgente = new Set((cfgs || []).map(c => c.linea_id));
  }
  const lineas = lineasOut.map(l => ({ ...l, tiene_agente: conAgente.has(l.phone_number_id) }));

  return res.status(200).json({ status: 'ok', lineas, esGerencia: esGerencia(nombre), soyMateo: esMateo(nombre) });
}
