/* =============================================================================
 * INTEGRACIONES (Fase A) — panel para conectar fuentes de datos (Google Sheets,
 * Supabase) a la bandeja. Las llaves se guardan en el servidor; aquí solo se ven
 * enmascaradas. Usa globales de la bandeja: api, lineaActual, esc.
 * ========================================================================== */

let integItems = [];
let integForm = null;   // { id?, tipo, nombre, config }

function intTipoNom(t) { return t === 'google_sheets' ? 'Google Sheets' : t === 'supabase' ? 'Supabase' : t; }
function intTipoIco(t) { return t === 'google_sheets' ? '📄' : '🗄️'; }

async function cargarIntegraciones() {
  integForm = null;
  document.getElementById('integForm').innerHTML = '';
  const cont = document.getElementById('integLista');
  cont.textContent = 'Cargando…';
  const r = await api('integraciones', { accion: 'listar', linea_id: lineaActual });
  if (!r || r.status !== 'ok') { cont.textContent = (r && r.mensaje) || 'No se pudo cargar.'; return; }
  integItems = r.integraciones || [];
  if (!integItems.length) {
    cont.innerHTML = '<div style="color:var(--ink-mute);font-size:13px;padding:8px 0">Aún no hay conexiones. Conecta tu Google Sheets o tu Supabase con los botones de arriba.</div>';
    return;
  }
  cont.innerHTML = integItems.map(intRenderCard).join('');
}

function intRenderCard(i) {
  const cfg = i.config || {};
  const detalle = i.tipo === 'supabase'
    ? `tabla: ${esc(cfg.tabla || '—')} · llave: ${esc(cfg.key || '—')}`
    : `hoja pública${cfg.hoja ? ' · ' + esc(cfg.hoja) : ''}`;
  const mapeado = cfg.mapeo && cfg.mapeo.telefono;
  const estadoMapeo = mapeado
    ? '<span style="color:#1f5c34;font-weight:600">✓ datos mapeados</span>'
    : '<span style="color:#8A6116;font-weight:600">⚠ falta mapear los datos</span>';
  return `<div class="int-card">
    <div class="int-card-top">
      <div class="int-ico">${intTipoIco(i.tipo)}</div>
      <div style="min-width:0">
        <div class="int-nom">${esc(i.nombre)}</div>
        <div class="int-meta">${intTipoNom(i.tipo)} · ${detalle}</div>
        <div class="int-meta" style="margin-top:2px">${estadoMapeo}</div>
      </div>
      <div class="int-acc">
        <button class="int-chip" onclick="mapearIntegracion('${i.id}')">Mapear datos</button>
        <button class="int-chip" onclick="probarIntegracion('${i.id}')">Probar</button>
        <button class="int-chip" onclick="editarIntegracion('${i.id}')">Editar</button>
        <button class="int-chip rojo" onclick="eliminarIntegracion('${i.id}')">Eliminar</button>
      </div>
    </div>
    <div id="int-prueba-${i.id}"></div>
  </div>`;
}

// ── Mapeo de columnas (qué columna del rifero es cada campo estándar) ────────
async function mapearIntegracion(id) {
  const i = integItems.find(x => x.id === id);
  if (!i) return;
  const cont = document.getElementById('integForm');
  cont.innerHTML = '<div class="int-form">Detectando las columnas de tu fuente…</div>';
  cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const r = await api('integraciones', { accion: 'columnas', linea_id: lineaActual, id });
  integForm = {
    id, tipo: i.tipo, nombre: i.nombre, config: { ...(i.config || {}) },
    columnas: (r && r.columnas) || [], campos: (r && r.campos_estandar) || [],
  };
  intRenderMapeo();
}
function intRenderMapeo() {
  const f = integForm, cont = document.getElementById('integForm');
  const mapeo = f.config.mapeo || {};
  const filas = f.config.filas || 'por_boleta';
  const cols = f.columnas || [];
  const filaCampo = c => {
    const sel = mapeo[c.clave] || '';
    const control = cols.length
      ? `<select data-campo="${c.clave}"><option value="">— ninguna —</option>${cols.map(x => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`
      : `<input data-campo="${c.clave}" type="text" value="${esc(sel)}" placeholder="nombre de tu columna">`;
    return `<div class="int-map-row"><label>${esc(c.nombre)}${c.obligatorio ? ' ⭐' : ''}</label>${control}</div>`;
  };
  cont.innerHTML = `<div class="int-form">
    <div style="font-weight:700;margin-bottom:2px">Mapear datos de "${esc(f.nombre)}"</div>
    <div class="int-hint">${cols.length
      ? 'Elige qué columna TUYA corresponde a cada dato del sistema. El Teléfono ⭐ es obligatorio (es la llave para encontrar al cliente).'
      : 'No detecté las columnas solas (la llave puede no tener permiso de lectura, o la tabla está vacía). Escribe el nombre EXACTO de tu columna en cada campo.'}</div>
    <label style="margin-top:14px">¿Cómo está tu tabla / hoja?</label>
    <select id="mp_filas">
      <option value="por_boleta" ${filas === 'por_boleta' ? 'selected' : ''}>Una fila por cada BOLETA (se suman abonos y saldos por cliente)</option>
      <option value="por_cliente" ${filas === 'por_cliente' ? 'selected' : ''}>Una fila por cada CLIENTE</option>
    </select>
    <div style="margin-top:10px">${f.campos.map(filaCampo).join('')}</div>
    <div id="if_aviso"></div>
    <div class="int-row">
      <button class="int-btn menta" onclick="guardarMapeo()">Guardar mapeo</button>
      <button class="int-btn" onclick="intCerrarForm()">Cancelar</button>
    </div>
  </div>`;
}
async function guardarMapeo() {
  const f = integForm;
  const mapeo = {};
  document.querySelectorAll('#integForm [data-campo]').forEach(el => { const v = el.value.trim(); if (v) mapeo[el.getAttribute('data-campo')] = v; });
  if (!mapeo.telefono) { alert('El Teléfono es obligatorio: es la llave para encontrar al cliente en tu base.'); return; }
  const config = { ...f.config, mapeo, filas: document.getElementById('mp_filas').value };
  delete config.key;   // no reenviar la llave enmascarada (el backend conserva la real)
  for (const k of Object.keys(config)) if (k.startsWith('_') && k.endsWith('_set')) delete config[k];
  const r = await api('integraciones', { accion: 'guardar', linea_id: lineaActual, id: f.id, tipo: f.tipo, nombre: f.nombre, config });
  if (r && r.status === 'ok') { intCerrarForm(); cargarIntegraciones(); }
  else alert((r && r.mensaje) || 'No se pudo guardar el mapeo.');
}

function nuevaIntegracion(tipo) { integForm = { tipo, nombre: '', config: {} }; intRenderForm(); }
function editarIntegracion(id) {
  const i = integItems.find(x => x.id === id);
  if (!i) return;
  integForm = { id, tipo: i.tipo, nombre: i.nombre, config: { ...(i.config || {}) } };
  intRenderForm();
  document.getElementById('integForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function intCerrarForm() { integForm = null; document.getElementById('integForm').innerHTML = ''; }

function intRenderForm() {
  const f = integForm, cont = document.getElementById('integForm');
  if (!f) { cont.innerHTML = ''; return; }
  const v = k => esc(f.config[k] || '');
  let campos;
  if (f.tipo === 'google_sheets') {
    campos = `
      <label>Enlace de tu hoja de Google</label>
      <input id="if_url" type="url" value="${v('url')}" placeholder="https://docs.google.com/spreadsheets/d/…">
      <div class="int-hint">En Google Sheets: Compartir → "Cualquier persona con el enlace" → Lector. (De solo lectura.)</div>
      <label>Nombre de la pestaña (opcional)</label>
      <input id="if_hoja" type="text" value="${v('hoja')}" placeholder="Hoja 1">`;
  } else {
    const keyMasked = f.id && f.config._key_set;
    campos = `
      <label>URL de tu proyecto Supabase</label>
      <input id="if_url" type="url" value="${v('url')}" placeholder="https://xxxx.supabase.co">
      <label>Llave (API key de Supabase)</label>
      <input id="if_key" type="text" value="" placeholder="${keyMasked ? 'Guardada (' + esc(f.config.key) + ') — déjalo vacío para no cambiarla' : 'eyJhbGciOi…'}">
      <div class="int-hint">La llave se guarda solo en el servidor; aquí nunca se muestra completa.${keyMasked ? ' Ya hay una guardada; escribe solo si quieres cambiarla.' : ''}</div>
      <label>Tabla a consultar</label>
      <input id="if_tabla" type="text" value="${v('tabla')}" placeholder="boletas">`;
  }
  cont.innerHTML = `<div class="int-form">
    <div style="font-weight:700;margin-bottom:2px">${f.id ? 'Editar' : 'Conectar'} ${intTipoNom(f.tipo)}</div>
    <label>Nombre de la conexión</label>
    <input id="if_nombre" type="text" value="${esc(f.nombre)}" placeholder="ej: Mi rifa">
    ${campos}
    <div id="if_aviso"></div>
    <div class="int-row">
      <button class="int-btn suave" onclick="probarForm()">Probar conexión</button>
      <button class="int-btn menta" onclick="guardarIntegracion()">Guardar</button>
      <button class="int-btn" onclick="intCerrarForm()">Cancelar</button>
    </div>
  </div>`;
}

function intLeerForm() {
  const f = integForm;
  if (!f) return null;
  f.nombre = document.getElementById('if_nombre').value.trim();
  const cfg = { url: document.getElementById('if_url').value.trim() };
  if (f.tipo === 'google_sheets') cfg.hoja = document.getElementById('if_hoja').value.trim();
  else {
    cfg.tabla = document.getElementById('if_tabla').value.trim();
    const k = document.getElementById('if_key').value.trim();
    if (k) cfg.key = k;   // vacío en edición → el backend conserva la llave guardada
  }
  f.config = cfg;
  return f;
}

async function probarForm() {
  const f = intLeerForm(), av = document.getElementById('if_aviso');
  av.className = 'int-aviso'; av.textContent = 'Probando…';
  // En edición de Supabase sin llave nueva, probar la conexión GUARDADA (por id).
  const usarGuardada = f.tipo === 'supabase' && f.id && !f.config.key;
  const body = usarGuardada
    ? { accion: 'probar', linea_id: lineaActual, id: f.id }
    : { accion: 'probar', linea_id: lineaActual, tipo: f.tipo, config: f.config };
  const r = await api('integraciones', body);
  const p = r && r.prueba;
  av.className = 'int-aviso ' + (p && p.ok ? 'ok' : 'err');
  av.textContent = p ? p.mensaje : ((r && r.mensaje) || 'No se pudo probar.');
}

async function guardarIntegracion() {
  const f = intLeerForm();
  if (!f.nombre) { alert('Ponle un nombre a la conexión.'); return; }
  const r = await api('integraciones', { accion: 'guardar', linea_id: lineaActual, id: f.id, tipo: f.tipo, nombre: f.nombre, config: f.config });
  if (r && r.status === 'ok') { intCerrarForm(); cargarIntegraciones(); }
  else alert((r && r.mensaje) || 'No se pudo guardar.');
}

async function probarIntegracion(id) {
  const box = document.getElementById('int-prueba-' + id);
  box.innerHTML = '<div class="int-aviso">Probando…</div>';
  const r = await api('integraciones', { accion: 'probar', linea_id: lineaActual, id });
  const p = r && r.prueba;
  box.innerHTML = `<div class="int-aviso ${p && p.ok ? 'ok' : 'err'}">${esc(p ? p.mensaje : ((r && r.mensaje) || 'Error'))}</div>`;
}

async function eliminarIntegracion(id) {
  if (!confirm('¿Eliminar esta conexión? Los flujos que la usen dejarán de funcionar.')) return;
  const r = await api('integraciones', { accion: 'eliminar', linea_id: lineaActual, id });
  if (!r || r.status !== 'ok') { alert((r && r.mensaje) || 'No se pudo eliminar la conexión.'); return; }
  cargarIntegraciones();
}
