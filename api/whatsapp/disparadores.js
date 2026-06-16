/**
 * Disparadores del agente: palabras clave por línea que, al llegar en un mensaje del cliente,
 * PRENDEN el agente automáticamente en ese chat (como los disparadores de ChateaPro).
 *
 * Aquí solo se ADMINISTRAN (listar/crear/eliminar/prender-apagar). El disparo real lo hace
 * `recibir.js` cuando entra un mensaje (función `activarPorDisparador`).
 *
 * SOLO Mateo (el agente está en prueba). Acciones (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { esMateo, puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!esMateo(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede configurar los disparadores.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });

  try {
    if (accion === 'listar') {
      const { data } = await supabase
        .from('disparadores').select('id, palabra, tipo, activo, destino, flujo_id, evento_valor, created_at, flujos(nombre)')
        .eq('linea_id', linea_id).order('created_at', { ascending: true });
      const disparadores = (data || []).map(d => ({ ...d, flujo_nombre: d.flujos ? d.flujos.nombre : null, flujos: undefined }));
      return res.status(200).json({ status: 'ok', disparadores });
    }

    if (accion === 'crear') {
      const TIPOS = ['palabra', 'nuevo_contacto', 'etiqueta_aplicada'];
      const tipo = TIPOS.includes(req.body.tipo) ? req.body.tipo : 'palabra';
      const destino = req.body.destino === 'flujo' ? 'flujo' : 'agente';
      let flujo_id = null;
      if (destino === 'flujo') {
        flujo_id = req.body.flujo_id || null;
        if (!flujo_id) return res.status(200).json({ status: 'error', mensaje: 'Elige el flujo que se va a disparar.' });
        const { data: fl } = await supabaseAdmin.from('flujos').select('id').eq('id', flujo_id).eq('linea_id', linea_id).maybeSingle();
        if (!fl) return res.status(200).json({ status: 'error', mensaje: 'No se encontró ese flujo en esta línea.' });
      }

      const fila = { linea_id, tipo, destino, flujo_id, activo: true, palabra: null, evento_valor: null };
      if (tipo === 'palabra') {
        fila.palabra = String(req.body.palabra || '').trim().slice(0, 200);
        if (!fila.palabra) return res.status(200).json({ status: 'error', mensaje: 'Escribe la palabra o frase clave.' });
      } else if (tipo === 'nuevo_contacto') {
        // Solo uno por línea (es un on/off: "atender a todo cliente nuevo").
        const { data: yaHay } = await supabase
          .from('disparadores').select('id').eq('linea_id', linea_id).eq('tipo', 'nuevo_contacto').maybeSingle();
        if (yaHay) return res.status(200).json({ status: 'error', mensaje: 'Ya existe un disparador de "cliente nuevo". Elimínalo si quieres cambiar su destino.' });
      } else if (tipo === 'etiqueta_aplicada') {
        fila.evento_valor = String(req.body.evento_valor || '').trim().slice(0, 120) || null;   // null = cualquier etiqueta
      }
      const { error } = await supabaseAdmin.from('disparadores').insert(fila);
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'eliminar') {
      const id = String(req.body.id || '').trim();
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el disparador.' });
      await supabaseAdmin.from('disparadores').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    if (accion === 'toggle') {
      const id = String(req.body.id || '').trim();
      const activo = !!req.body.activo;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el disparador.' });
      await supabaseAdmin.from('disparadores').update({ activo }).eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
