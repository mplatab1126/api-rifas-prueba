/**
 * Cerebro compartido de las integraciones: dado un teléfono, busca al contacto en
 * la fuente externa conectada (Google Sheets o Supabase), mapea las columnas del
 * rifero a los CAMPOS ESTÁNDAR del sistema, y agrega cuando hay varias filas.
 *
 * Lo usan: el endpoint (acción 'consultar', para la ficha del chat) y el motor de
 * flujos (para que las condiciones puedan usar {{total_abonado}}, {{saldo}}, etc.).
 *
 * Estandarización: el rifero NO cambia su formato; solo dice qué columna suya es cada
 * campo estándar (config.mapeo). Si su tabla tiene una fila por BOLETA, los números se
 * SUMAN y las boletas se LISTAN (config.filas='por_boleta'); si tiene una fila por
 * CLIENTE, se toma esa fila tal cual (config.filas='por_cliente').
 */

import { supabaseAdmin } from './supabase.js';

// Lista FIJA de campos que el sistema entiende. El rifero mapea sus columnas a estos.
export const CAMPOS_ESTANDAR = [
  { clave: 'telefono',      nombre: 'Teléfono',            tipo: 'texto',  obligatorio: true },
  { clave: 'nombre',        nombre: 'Nombre',              tipo: 'texto' },
  { clave: 'apellido',      nombre: 'Apellido',            tipo: 'texto' },
  { clave: 'documento',     nombre: 'Documento / cédula',  tipo: 'texto' },
  { clave: 'ciudad',        nombre: 'Ciudad',              tipo: 'texto' },
  { clave: 'correo',        nombre: 'Correo',              tipo: 'texto' },
  { clave: 'boleta',        nombre: 'Número(s) de boleta', tipo: 'lista' },
  { clave: 'total_abonado', nombre: 'Total abonado',       tipo: 'numero' },
  { clave: 'saldo',         nombre: 'Saldo / restante',    tipo: 'numero' },
  { clave: 'estado_pago',   nombre: 'Estado de pago',      tipo: 'texto' },
];

const sol10 = t => String(t || '').replace(/\D/g, '').slice(-10);
// Pesos enteros: deja solo dígitos. "80.000" → 80000, "$1.234.500" → 1234500.
const aNumero = v => { const s = String(v == null ? '' : v).replace(/[^\d]/g, ''); return s ? parseInt(s, 10) : 0; };

function idHojaGoogle(url) {
  const m = String(url || '').match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

// CSV de Google (respeta comillas y comas internas).
function parseCSV(texto) {
  const filas = []; let campo = '', fila = [], enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; }
      else campo += c;
    } else {
      if (c === '"') enComillas = true;
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
function filasComoObjetos(csv) {
  const filas = parseCSV(csv).filter(f => f.some(c => String(c).trim()));
  if (!filas.length) return { columnas: [], objetos: [] };
  const cols = filas[0].map(c => String(c).trim());
  const objetos = filas.slice(1).map(f => { const o = {}; cols.forEach((c, i) => { o[c] = f[i]; }); return o; });
  return { columnas: cols, objetos };
}

// ── Detectar columnas (para la pantalla de mapeo) ───────────────────────────
export async function columnasDe(tipo, config) {
  const c = config || {};
  try {
    if (tipo === 'supabase') {
      const base = String(c.url || '').replace(/\/+$/, '');
      if (!base || !c.key || !c.tabla) return [];
      const r = await fetch(`${base}/rest/v1/${encodeURIComponent(c.tabla)}?select=*&limit=1`,
        { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key }, signal: AbortSignal.timeout(12000) });
      const d = await r.json().catch(() => null);
      return Array.isArray(d) && d[0] ? Object.keys(d[0]) : [];
    }
    if (tipo === 'google_sheets') {
      const id = idHojaGoogle(c.url);
      if (!id) return [];
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv` + (c.hoja ? '&sheet=' + encodeURIComponent(c.hoja) : ''), { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const t = await r.text();
      if (t.trim().startsWith('<')) return [];
      return filasComoObjetos(t).columnas;
    }
  } catch (_) {}
  return [];
}

// ── Leer las filas que coinciden con el teléfono ────────────────────────────
async function leerFilasSupabase(c, telefono) {
  const base = String(c.url || '').replace(/\/+$/, '');
  const col = c.mapeo && c.mapeo.telefono;
  if (!base || !c.key || !c.tabla || !col) return [];
  // El formato del teléfono varía por rifero: probamos varias variantes con OR.
  const vs = [...new Set([String(telefono), sol10(telefono), '57' + sol10(telefono)])].filter(Boolean);
  const orq = vs.map(v => `${col}.eq.${encodeURIComponent(v)}`).join(',');
  try {
    const r = await fetch(`${base}/rest/v1/${encodeURIComponent(c.tabla)}?or=(${orq})&select=*&limit=200`,
      { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key }, signal: AbortSignal.timeout(12000) });
    const d = await r.json().catch(() => null);
    return Array.isArray(d) ? d : [];
  } catch (_) { return []; }
}
async function leerFilasSheets(c, telefono) {
  const id = idHojaGoogle(c.url);
  const col = c.mapeo && c.mapeo.telefono;
  if (!id || !col) return [];
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv` + (c.hoja ? '&sheet=' + encodeURIComponent(c.hoja) : ''), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const t = await r.text();
    if (t.trim().startsWith('<')) return [];
    const objetivo = sol10(telefono);
    return filasComoObjetos(t).objetos.filter(o => sol10(o[col]) === objetivo);
  } catch (_) { return []; }
}

// ── Consultar un contacto en UNA integración → campos estándar ──────────────
// Devuelve { campos:{clave→valor}, filas:n } o null si no hay coincidencia.
// Los numéricos (total_abonado, saldo) salen como NÚMERO crudo (para las condiciones).
export async function consultarContacto(integracion, telefono) {
  const c = integracion.config || {};
  const mapeo = c.mapeo || {};
  if (!mapeo.telefono) return null;
  const rows = integracion.tipo === 'supabase' ? await leerFilasSupabase(c, telefono) : await leerFilasSheets(c, telefono);
  if (!rows.length) return null;
  const porBoleta = (c.filas || 'por_boleta') === 'por_boleta';
  const campos = {};
  for (const f of CAMPOS_ESTANDAR) {
    const col = mapeo[f.clave];
    if (!col) continue;
    if (!porBoleta || rows.length === 1) {
      campos[f.clave] = f.tipo === 'numero' ? aNumero(rows[0][col]) : (rows[0][col] != null ? String(rows[0][col]).trim() : '');
      continue;
    }
    if (f.tipo === 'numero') campos[f.clave] = rows.reduce((s, r) => s + aNumero(r[col]), 0);
    else if (f.clave === 'boleta') campos[f.clave] = rows.map(r => String(r[col] == null ? '' : r[col]).trim()).filter(Boolean).join(', ');
    else campos[f.clave] = rows[0][col] != null ? String(rows[0][col]).trim() : '';
  }
  return { campos, filas: rows.length };
}

// ── Consultar por LÍNEA: prueba las integraciones activas y devuelve la 1ª que responda ──
export async function consultarPorLinea(lineaId, telefono) {
  const { data } = await supabaseAdmin.from('integraciones').select('*').eq('linea_id', lineaId).eq('estado', 'activa').order('created_at');
  for (const integ of (data || [])) {
    if (!integ.config || !integ.config.mapeo || !integ.config.mapeo.telefono) continue;
    const r = await consultarContacto(integ, telefono);
    if (r) return { ...r, integracion: { id: integ.id, nombre: integ.nombre, tipo: integ.tipo } };
  }
  return null;
}
