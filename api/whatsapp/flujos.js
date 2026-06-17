/**
 * Flujos (constructor visual de conversaciones, estilo ManyChat/ChateaPro).
 *
 * FASE 1: solo guardar/leer los flujos que se dibujan en la bandeja. Todavía NO
 * los ejecuta con clientes reales (eso es la Fase 2: api/lib/flujo-motor.js).
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, ... }
 *   listar   → flujos de la línea (sin el dibujo, para la lista; liviano)
 *   obtener  → { id } → un flujo COMPLETO (con su dibujo) para abrirlo en el editor
 *   crear    → { nombre } → crea un flujo vacío en borrador
 *   guardar  → { id, nombre, disparador, palabras, estado, grafo, carpeta }
 *   duplicar → { id } → copia un flujo (queda en borrador)
 *   eliminar → { id }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea, esMateo } from '../lib/asesores.js';
import { obtenerConfig, guardarConfig } from '../lib/configuracion.js';

const MAX_NOMBRE = 120;

function limpiarEstado(s) {
  return ['borrador', 'activo', 'pausado'].includes(s) ? s : 'borrador';
}
function limpiarDisparador(s) {
  return ['palabra', 'nuevo_contacto'].includes(s) ? s : 'palabra';
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombreAsesor, linea_id))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  }

  try {
    if (accion === 'listar') {
      const { data } = await supabase
        .from('flujos')
        .select('id, nombre, disparador, palabras, estado, carpeta, actualizado_at')
        .eq('linea_id', linea_id)
        .order('actualizado_at', { ascending: false });
      return res.status(200).json({ status: 'ok', flujos: data || [] });
    }

    if (accion === 'obtener') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el flujo.' });
      const { data } = await supabaseAdmin
        .from('flujos').select('*').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!data) return res.status(200).json({ status: 'error', mensaje: 'No se encontró el flujo.' });
      return res.status(200).json({ status: 'ok', flujo: data });
    }

    if (accion === 'crear') {
      const nombre = String(req.body.nombre || '').trim().slice(0, MAX_NOMBRE) || 'Flujo sin nombre';
      const { data, error } = await supabaseAdmin
        .from('flujos')
        .insert({ linea_id, nombre, estado: 'borrador', grafo: {}, creada_por: nombreAsesor })
        .select('id, nombre, disparador, palabras, estado, carpeta, actualizado_at')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', flujo: data });
    }

    if (accion === 'guardar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el flujo a guardar.' });
      const nombre = String(req.body.nombre || '').trim().slice(0, MAX_NOMBRE) || 'Flujo sin nombre';
      const grafo = (req.body.grafo && typeof req.body.grafo === 'object') ? req.body.grafo : {};
      const cambios = {
        nombre,
        disparador: limpiarDisparador(req.body.disparador),
        palabras: req.body.palabras != null ? String(req.body.palabras).slice(0, 1000) : null,
        estado: limpiarEstado(req.body.estado),
        grafo,
        carpeta: req.body.carpeta != null ? String(req.body.carpeta).slice(0, 80) : null,
        actualizado_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from('flujos').update(cambios).eq('id', id).eq('linea_id', linea_id)
        .select('id, nombre, disparador, palabras, estado, carpeta, actualizado_at').single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      if (!data) return res.status(200).json({ status: 'error', mensaje: 'No se encontró el flujo.' });
      return res.status(200).json({ status: 'ok', flujo: data });
    }

    if (accion === 'duplicar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el flujo.' });
      const { data: orig } = await supabaseAdmin
        .from('flujos').select('*').eq('id', id).eq('linea_id', linea_id).maybeSingle();
      if (!orig) return res.status(200).json({ status: 'error', mensaje: 'No se encontró el flujo.' });
      const { data, error } = await supabaseAdmin
        .from('flujos')
        .insert({
          linea_id, nombre: (orig.nombre + ' (copia)').slice(0, MAX_NOMBRE),
          disparador: orig.disparador, palabras: orig.palabras, estado: 'borrador',
          grafo: orig.grafo, carpeta: orig.carpeta, creada_por: nombreAsesor,
        })
        .select('id, nombre, disparador, palabras, estado, carpeta, actualizado_at').single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', flujo: data });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el flujo a eliminar.' });
      await supabaseAdmin.from('flujos').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    // Mover un flujo de carpeta SIN tocar el dibujo (se usa desde la lista).
    if (accion === 'carpeta') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta el flujo.' });
      const carpeta = req.body.carpeta != null ? String(req.body.carpeta).slice(0, 80) : null;
      const { data, error } = await supabaseAdmin.from('flujos')
        .update({ carpeta, actualizado_at: new Date().toISOString() })
        .eq('id', id).eq('linea_id', linea_id).select('id').single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      if (!data) return res.status(200).json({ status: 'error', mensaje: 'No se encontró el flujo.' });
      return res.status(200).json({ status: 'ok' });
    }

    // Interruptor de seguridad del MOTOR (global, solo Mateo): off | prueba | vivo.
    if (accion === 'config-get') {
      const modo = (await obtenerConfig('flujos_modo')) || 'off';
      const numeros = (await obtenerConfig('flujos_numeros_prueba')) || '';
      return res.status(200).json({ status: 'ok', modo, numeros });
    }
    if (accion === 'config-set') {
      if (!esMateo(nombreAsesor)) return res.status(200).json({ status: 'error', mensaje: 'Solo Mateo puede cambiar el modo del motor.' });
      const modo = ['off', 'prueba', 'vivo'].includes(req.body.modo) ? req.body.modo : 'off';
      const numeros = String(req.body.numeros || '').slice(0, 500);
      await guardarConfig('flujos_modo', modo);
      if (req.body.numeros != null) await guardarConfig('flujos_numeros_prueba', numeros);
      return res.status(200).json({ status: 'ok', modo, numeros });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
