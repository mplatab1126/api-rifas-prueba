/**
 * Costo de IA del agente (lectura).
 *
 * SOLO MATEO (igual que la cabina). Lee lo que se ha registrado en `agente_uso`
 * (los tokens que devuelve Claude en cada respuesta, ya convertidos a dólares por
 * el motor en `agente-responder.js`). NO calcula nada del lado del cliente.
 *
 * Acciones (POST, JSON: { contrasena, accion, linea_id, ... }):
 *   - resumen → gasto de IA de la línea: hoy, este mes y total (hora de Colombia).
 *   - chat    → gasto de IA acumulado en UN chat (para la ficha). Requiere conversacion_id.
 *   - embudo  → H35: embudo de ventas del agente (contacto → números → apartó → abonó)
 *               sobre una ventana de días (param `dias`, 1-90; por defecto 7).
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { esMateo, puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id, conversacion_id, dias } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  // El costo de IA es información de gerencia: solo Mateo, igual que la cabina del agente.
  if (!esMateo(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede ver el costo de IA.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });

  try {
    if (accion === 'resumen') {
      const { data, error } = await supabaseAdmin.rpc('agente_costo_resumen', { p_linea: String(linea_id) });
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', resumen: data || {} });
    }

    if (accion === 'chat') {
      // N2: la bandeja a veces NO conoce el id de la conversación (chat abierto desde el
      // buscador o fuera de los 300 de la lista) — se resuelve aquí por teléfono+línea.
      let conv = conversacion_id;
      if (!conv && req.body.telefono) {
        const { data: c } = await supabaseAdmin.from('conversaciones_whatsapp').select('id')
          .eq('telefono', String(req.body.telefono).replace(/\D/g, '')).eq('linea_id', String(linea_id)).maybeSingle();
        conv = c && c.id;
      }
      if (!conv) return res.status(200).json({ status: 'error', mensaje: 'Falta la conversación.' });
      const { data, error } = await supabaseAdmin.rpc('agente_costo_chat', { p_conv: String(conv) });
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', chat: data || {} });
    }

    if (accion === 'embudo') {
      const { data, error } = await supabaseAdmin.rpc('agente_embudo_resumen', {
        p_linea: String(linea_id), p_dias: Math.max(1, Math.min(90, Number(dias) || 7)),
      });
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', embudo: data || {} });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no reconocida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
