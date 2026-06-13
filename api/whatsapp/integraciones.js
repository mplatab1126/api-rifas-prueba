/**
 * Integraciones (Fase A): conexiones a fuentes de datos externas del rifero
 * (Google Sheets, Supabase) para que los flujos lean/registren datos de la rifa.
 *
 * SEGURIDAD: solo Mateo. Los secretos (llaves) viven en `integraciones.config` y
 * NUNCA se devuelven completos a la pantalla (se enmascaran). Todas las consultas a
 * la fuente externa las hace el BACKEND con la llave guardada.
 *
 * Acciones (POST, JSON): { contrasena, accion, linea_id, ... }
 *   listar   → conexiones de la línea (con las llaves enmascaradas)
 *   guardar  → { id?, tipo, nombre, config } (crea o actualiza; si la llave viene
 *              vacía en una edición, se conserva la guardada)
 *   probar   → { id } ó { tipo, config } → prueba la conexión (solo lectura)
 *   eliminar → { id }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea, esMateo } from '../lib/asesores.js';

const CLAVES_SECRETAS = ['key', 'service_key', 'anon_key', 'token', 'password'];

// Devuelve una copia de config con los secretos enmascarados (••••1234).
function enmascarar(config) {
  const c = { ...(config || {}) };
  for (const k of CLAVES_SECRETAS) {
    if (c[k]) { const s = String(c[k]); c[k] = '••••' + s.slice(-4); c['_' + k + '_set'] = true; }
  }
  return c;
}

function idHojaGoogle(url) {
  const m = String(url || '').match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

// ── Pruebas de conexión (SOLO LECTURA) ──────────────────────────────────────
async function probarGoogleSheets(config) {
  const id = idHojaGoogle(config.url);
  if (!id) return { ok: false, mensaje: 'Ese enlace no parece de Google Sheets. Copia el enlace completo de la hoja.' };
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv` +
    (config.hoja ? '&sheet=' + encodeURIComponent(config.hoja) : '');
  try {
    const r = await fetch(csvUrl, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { ok: false, mensaje: `Google respondió ${r.status}. Revisa que el enlace sea "cualquiera con el enlace puede ver".` };
    const texto = await r.text();
    if (texto.trim().startsWith('<')) return { ok: false, mensaje: 'La hoja no es pública. En Google Sheets: Compartir → Cualquier persona con el enlace → Lector.' };
    const filas = texto.split('\n').filter(l => l.trim());
    const columnas = (filas[0] || '').split(',').map(c => c.replace(/^"|"$/g, '').trim()).filter(Boolean);
    return { ok: true, mensaje: `Conectada. ${Math.max(0, filas.length - 1)} filas, columnas: ${columnas.slice(0, 8).join(', ')}` };
  } catch (e) {
    return { ok: false, mensaje: e.name === 'TimeoutError' ? 'La hoja tardó demasiado en responder.' : ('No se pudo leer la hoja: ' + e.message) };
  }
}

async function probarSupabase(config) {
  const base = String(config.url || '').replace(/\/+$/, '');
  if (!/^https:\/\/.+\.supabase\.co$/i.test(base)) return { ok: false, mensaje: 'La URL debe ser tu proyecto de Supabase, ej: https://xxxx.supabase.co' };
  if (!config.key) return { ok: false, mensaje: 'Falta la llave (API key) de Supabase.' };
  if (!config.tabla) return { ok: false, mensaje: 'Falta el nombre de la tabla a consultar.' };
  try {
    const r = await fetch(`${base}/rest/v1/${encodeURIComponent(config.tabla)}?select=*&limit=1`, {
      headers: { apikey: config.key, Authorization: 'Bearer ' + config.key },
      signal: AbortSignal.timeout(12000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, mensaje: `Supabase respondió ${r.status}: ${(data && data.message) || 'revisa la URL, la llave y el nombre de la tabla.'}` };
    const cols = Array.isArray(data) && data[0] ? Object.keys(data[0]) : [];
    return { ok: true, mensaje: cols.length ? `Conectada. Columnas de "${config.tabla}": ${cols.slice(0, 8).join(', ')}` : `Conectada a "${config.tabla}" (sin filas todavía).` };
  } catch (e) {
    return { ok: false, mensaje: e.name === 'TimeoutError' ? 'Supabase tardó demasiado en responder.' : ('No se pudo conectar: ' + e.message) };
  }
}

async function probar(tipo, config) {
  if (tipo === 'google_sheets') return probarGoogleSheets(config);
  if (tipo === 'supabase') return probarSupabase(config);
  return { ok: false, mensaje: 'Tipo de integración no soportado.' };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombreAsesor, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });
  // Las integraciones manejan credenciales: solo Mateo.
  if (!esMateo(nombreAsesor)) return res.status(200).json({ status: 'error', mensaje: 'Solo Mateo puede gestionar las integraciones.' });

  try {
    if (accion === 'listar') {
      const { data } = await supabaseAdmin
        .from('integraciones').select('id, tipo, nombre, config, estado, ultimo_error, actualizado_at')
        .eq('linea_id', linea_id).order('created_at', { ascending: false });
      const integraciones = (data || []).map(i => ({ ...i, config: enmascarar(i.config) }));
      return res.status(200).json({ status: 'ok', integraciones });
    }

    if (accion === 'probar') {
      let tipo = req.body.tipo, config = req.body.config || {};
      if (req.body.id) {   // probar una guardada: usar su config real
        const { data } = await supabaseAdmin.from('integraciones').select('tipo, config').eq('id', req.body.id).eq('linea_id', linea_id).maybeSingle();
        if (!data) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la integración.' });
        tipo = data.tipo; config = data.config || {};
      }
      const r = await probar(tipo, config);
      return res.status(200).json({ status: 'ok', prueba: r });
    }

    if (accion === 'guardar') {
      const tipo = ['google_sheets', 'supabase'].includes(req.body.tipo) ? req.body.tipo : null;
      const nombre = String(req.body.nombre || '').trim().slice(0, 100);
      const entrada = (req.body.config && typeof req.body.config === 'object') ? req.body.config : {};
      if (!tipo) return res.status(200).json({ status: 'error', mensaje: 'Tipo de integración no válido.' });
      if (!nombre) return res.status(200).json({ status: 'error', mensaje: 'Ponle un nombre a la conexión.' });

      // En edición, conservar los secretos guardados si llegan vacíos (la pantalla no los recibe).
      let config = { ...entrada };
      if (req.body.id) {
        const { data: actual } = await supabaseAdmin.from('integraciones').select('config').eq('id', req.body.id).eq('linea_id', linea_id).maybeSingle();
        if (!actual) return res.status(200).json({ status: 'error', mensaje: 'No se encontró la integración.' });
        for (const k of CLAVES_SECRETAS) { if (!config[k] && actual.config && actual.config[k]) config[k] = actual.config[k]; }
      }
      // limpiar campos de control que pudieran venir del enmascarado
      for (const k of Object.keys(config)) if (k.startsWith('_') && k.endsWith('_set')) delete config[k];

      const fila = { linea_id, tipo, nombre, config, estado: 'activa', actualizado_at: new Date().toISOString() };
      let guardada;
      if (req.body.id) {
        const { data } = await supabaseAdmin.from('integraciones').update(fila).eq('id', req.body.id).eq('linea_id', linea_id).select('id, tipo, nombre, config, estado').single();
        guardada = data;
      } else {
        const { data } = await supabaseAdmin.from('integraciones').insert({ ...fila, creada_por: nombreAsesor }).select('id, tipo, nombre, config, estado').single();
        guardada = data;
      }
      if (!guardada) return res.status(200).json({ status: 'error', mensaje: 'No se pudo guardar.' });
      return res.status(200).json({ status: 'ok', integracion: { ...guardada, config: enmascarar(guardada.config) } });
    }

    if (accion === 'eliminar') {
      const { id } = req.body;
      if (!id) return res.status(200).json({ status: 'error', mensaje: 'Falta la integración a eliminar.' });
      await supabaseAdmin.from('integraciones').delete().eq('id', id).eq('linea_id', linea_id);
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
