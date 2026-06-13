/* =============================================================================
 * FLUJOS — constructor visual de conversaciones, integrado en la bandeja.
 * FASE 1: dibujar / guardar / probar (simulador). Todavía NO corre con clientes
 * reales (eso es la Fase 2: api/lib/flujo-motor.js + enganche en recibir.js).
 *
 * Portado del prototipo del SaaS, adaptado a la bandeja:
 *   - Los datos van por api('flujos', {...}) (no Supabase directo desde el navegador).
 *   - Single-tenant: usa lineaActual (la línea seleccionada), no empresa_id.
 *   - Solo Mateo (soyMateo). Etiquetas reales de la línea; campos = texto libre.
 * Usa globales de la bandeja: api, lineaActual, soyMateo, etiquetasCache, esc.
 * ========================================================================== */

let flFlujos = [], flujoAbierto = null;
let etiquetas = [], miembros = [];     // miembros (asesores) se queda vacío en Fase 1
let editor = null, carpetaActiva = null;
const iaLlave = null;                  // sin llave aquí: el simulador clasifica por palabras
// soyMateo / etiquetasCache / api / lineaActual son globales de la bandeja (script inline);
// se acceden directo (mismo entorno léxico global), no por window.
const esAdmin = () => (typeof soyMateo !== 'undefined' && soyMateo);
function escapar(t){ return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- entrada desde el menú de la bandeja ----------
async function cargarFlujosModulo(){
  // traer etiquetas de la línea (para la cajita "Acción"); reusar caché si está
  if (typeof etiquetasCache !== 'undefined' && etiquetasCache && etiquetasCache.length) etiquetas = etiquetasCache;
  else {
    const re = await api('etiquetas', { accion:'listar', linea_id: lineaActual });
    etiquetas = (re && re.etiquetas) || [];
  }
  // si veníamos en el editor de otra línea, volver a la lista
  document.getElementById('flVistaEditor').style.display = 'none';
  document.getElementById('flVistaLista').style.display = 'block';
  renderModoMotor();
  cargarFlujos();
}

// ── Interruptor de seguridad del motor (off | prueba | vivo) ──────────────────
async function renderModoMotor() {
  const cont = document.getElementById('flModoMotor');
  if (!cont) return;
  const r = await api('flujos', { accion: 'config-get', linea_id: lineaActual });
  const modo = (r && r.modo) || 'off';
  const numeros = (r && r.numeros) || '';
  const btn = (val, txt) => `<button class="fl-modo-btn ${modo === val ? 'on' : ''} ${val === 'vivo' ? 'vivo' : ''}" onclick="setModoMotor('${val}')">${txt}</button>`;
  const desc = modo === 'off' ? 'Apagado: ningún flujo le responde a nadie, aunque esté marcado "Activo". Recomendado mientras armas y pruebas.'
    : modo === 'prueba' ? 'Modo prueba: los flujos activos SOLO le responden a los números de abajo (tú). Ideal para probar en vivo sin tocar clientes.'
    : '⚠️ EN VIVO: los flujos marcados "Activo" le responden a TODOS los clientes reales.';
  cont.innerHTML = `
    <div class="fl-modo-row">
      <span class="fl-modo-tit">⚙️ Motor de flujos:</span>
      ${btn('off', 'Apagado')}${btn('prueba', 'Modo prueba')}${btn('vivo', 'En vivo')}
    </div>
    <div class="fl-modo-desc">${desc}</div>
    ${modo === 'prueba' ? `<div class="fl-modo-num">
      <input id="flNumerosPrueba" type="text" value="${escapar(numeros)}" placeholder="Tu número con indicativo, ej: 573001234567 (varios con coma)">
      <button class="boton chico menta" onclick="guardarNumerosPrueba(this)">Guardar números</button>
    </div>` : ''}`;
}
async function setModoMotor(modo) {
  if (modo === 'vivo' && !confirm('¿Poner el motor EN VIVO? Los flujos marcados "Activo" le responderán a TODOS los clientes reales.')) return;
  const numerosEl = document.getElementById('flNumerosPrueba');
  const body = { accion: 'config-set', linea_id: lineaActual, modo };
  if (numerosEl) body.numeros = numerosEl.value;
  const r = await api('flujos', body);
  if (r && r.status === 'ok') renderModoMotor();
  else alert((r && r.mensaje) || 'No se pudo cambiar el modo.');
}
async function guardarNumerosPrueba(btn) {
  const numeros = document.getElementById('flNumerosPrueba').value;
  const r = await api('flujos', { accion: 'config-set', linea_id: lineaActual, modo: 'prueba', numeros });
  if (btn) { btn.textContent = r && r.status === 'ok' ? 'Guardado ✓' : 'Error'; setTimeout(() => { btn.textContent = 'Guardar números'; }, 1500); }
}

// ---------- lista ----------
async function cargarFlujos() {
  document.getElementById('botonNuevoFlujo').style.display = esAdmin() ? 'inline-flex' : 'none';
  document.getElementById('zonaPlantillas').style.display = esAdmin() ? 'block' : 'none';
  const caja = document.getElementById('listaFlujos');
  caja.className = 'fl-cargando'; caja.textContent = 'Cargando…';
  const r = await api('flujos', { accion:'listar', linea_id: lineaActual });
  if (!r || r.status !== 'ok') { caja.textContent = 'Error cargando los flujos'; return; }
  flFlujos = r.flujos || [];
  caja.className = '';
  if (!flFlujos.length) {
    caja.innerHTML = `<div class="fl-tarjeta" style="text-align:center; padding:40px; color:var(--ink-mute);">
      Aún no hay flujos.${esAdmin() ? ' Crea el primero: un saludo automático con las palabras "hola, info".' : ''}</div>`;
    return;
  }
  const carpetas = [...new Set(flFlujos.map(f => f.carpeta).filter(Boolean))].sort();
  if (carpetaActiva && !carpetas.includes(carpetaActiva)) carpetaActiva = null;
  const chips = carpetas.length ? `
    <div style="display:flex; gap:7px; flex-wrap:wrap; margin-bottom:14px;">
      <button class="fl-chip ${!carpetaActiva ? 'activo' : ''}" onclick="filtrarCarpeta(null)">Todos</button>
      ${carpetas.map(c => `<button class="fl-chip ${carpetaActiva === c ? 'activo' : ''}" onclick='filtrarCarpeta(${JSON.stringify(c)})'>
        <svg width="12" height="12" style="vertical-align:-1px"><use href="#fli-carpeta"/></svg> ${escapar(c)}</button>`).join('')}
    </div>` : '';
  const visibles = carpetaActiva ? flFlujos.filter(f => f.carpeta === carpetaActiva) : flFlujos;
  caja.innerHTML = chips + visibles.map(f => `
    <div class="fl-tarjeta fl-tarjeta-flujo" onclick='abrirFlujo(${JSON.stringify(f.id)})'>
      <div class="icono-flujo"><svg width="20" height="20"><use href="#fli-flujo"/></svg></div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600;">${escapar(f.nombre)}</div>
        <div class="fl-sub">
          ${f.disparador === 'nuevo_contacto' ? 'Con cada contacto nuevo' : 'Con las palabras: ' + escapar(f.palabras || '—')}
          ${f.carpeta && !carpetaActiva ? ' · en ' + escapar(f.carpeta) : ''}</div>
      </div>
      <span class="fl-pildora ${f.estado}">${f.estado}</span>
    </div>`).join('');
}
function filtrarCarpeta(c) { carpetaActiva = c; cargarFlujos(); }

async function nuevoFlujo() {
  const r = await api('flujos', { accion:'crear', linea_id: lineaActual, nombre: 'Flujo sin nombre' });
  if (!r || r.status !== 'ok') { alert('No se pudo crear: ' + ((r && r.mensaje) || '')); return; }
  flFlujos.unshift(r.flujo);
  abrirFlujo(r.flujo.id);
}

// ---------- plantillas listas para rifas ----------
async function crearDesdePlantilla(clave) {
  if (!esAdmin()) return;
  const meta = {
    bienvenida: { nombre: 'Bienvenida de la rifa', palabras: 'hola, info, buenas' },
    cobro: { nombre: 'Cobro amable', palabras: '' },
    postsorteo: { nombre: 'Después del sorteo', palabras: 'resultados, ganador' }
  }[clave];
  const r = await api('flujos', { accion:'crear', linea_id: lineaActual, nombre: meta.nombre });
  if (!r || r.status !== 'ok') { alert((r && r.mensaje) || 'No se pudo crear'); return; }
  flFlujos.unshift(r.flujo);
  await abrirFlujo(r.flujo.id);
  document.getElementById('edPalabras').value = meta.palabras;
  const inicio = Object.keys(nodos()).find(k => nodos()[k].name === 'inicio');
  // Solo se usan los 5 nodos base. Los menús de botones son "Mensaje con botones"
  // (respuesta:'botones' → 4 salidas), que es una variante de Mensaje.
  const N = (tipo, x, y, datos) => {
    const outs = (tipo === 'mensaje' && datos.respuesta === 'botones') ? 4
               : (tipo === 'mensaje' && datos.respuesta === 'lista') ? 2
               : salidasDe(tipo);
    return editor.addNode(tipo, tipo === 'comentario' ? 0 : 1, outs, x, y, 'nodo-' + tipo, datos, nodoHtml(tipo, datos), false);
  };
  const C = (a, b, sal) => editor.addConnection(a, b, sal || 'output_1', 'input_1');

  if (clave === 'bienvenida') {
    const menu = N('mensaje', 280, 80, { texto: '¡Hola! Bienvenido a nuestra rifa 🎉 ¿Qué quieres hacer?', respuesta: 'botones', btn1: 'Comprar boleta', btn2: 'Ver premios', btn3: 'Hablar con asesor' });
    const preg = N('pregunta', 620, 20, { texto: '¿Qué número quieres? Escríbelo y lo revisamos 🍀', tipo: 'numero', campo: '', reintentos: 3, saltar: '' });
    const pago = N('mensaje', 940, 20, { texto: 'Para apartarlo: [ESCRIBE AQUÍ TUS CUENTAS DE PAGO]. Cuando pagues, envíame el comprobante por aquí 🙏' });
    const premios = N('mensaje', 620, 240, { texto: '🏆 [DESCRIBE AQUÍ TUS PREMIOS Y LA FECHA DEL SORTEO]' });
    const asesor = N('mensaje', 620, 420, { texto: 'Con gusto te ayudamos 🙌 En un momento te atiende un asesor.' });
    C(inicio, menu); C(menu, preg, 'output_1'); C(preg, pago); C(menu, premios, 'output_2');
    C(premios, menu); C(menu, asesor, 'output_3'); C(menu, asesor, 'output_4');
  }
  if (clave === 'cobro') {
    const saludo = N('mensaje', 260, 80, { texto: 'Hola {{nombre}} 👋 Te escribimos de Los Plata: tu boleta tiene saldo pendiente para el sorteo.' });
    const menu = N('mensaje', 560, 80, { texto: '¿Cómo vamos con el pago?', respuesta: 'botones', btn1: 'Ya pagué', btn2: 'Pago hoy', btn3: 'Necesito ayuda' });
    const verificar = N('mensaje', 900, 20, { texto: '¡Genial! Mándame el comprobante por aquí y lo verificamos 🙏' });
    const animo = N('mensaje', 900, 200, { texto: '¡Perfecto! Te esperamos 🙌 Cuentas: [TUS CUENTAS]. Me avisas con el comprobante.' });
    const ayuda = N('mensaje', 900, 380, { texto: 'Con gusto te ayudamos 🙌 En un momento te atiende un asesor.' });
    C(inicio, saludo); C(saludo, menu); C(menu, verificar, 'output_1');
    C(menu, animo, 'output_2'); C(menu, ayuda, 'output_3'); C(menu, ayuda, 'output_4');
  }
  if (clave === 'postsorteo') {
    const anuncio = N('mensaje', 260, 80, { texto: '🎉 ¡Tenemos ganador! [NÚMERO Y NOMBRE DEL GANADOR]. Gracias por participar con nosotros.' });
    const menu = N('mensaje', 560, 80, { texto: '¿Quieres que te avisemos de la próxima rifa?', respuesta: 'botones', btn1: 'Sí, avísame', btn2: 'Por ahora no', btn3: '' });
    const marcar = N('accion', 880, 20, { accion: 'poner_etiqueta', etiqueta: etiquetas[0]?.nombre || 'Interesado', campo: '', valor: '' });
    const avisar = N('mensaje', 1160, 20, { texto: '¡Anotado! Te escribimos apenas abramos la próxima 🎟️' });
    const gracias = N('mensaje', 880, 240, { texto: 'Gracias por participar 🙏 ¡Hasta la próxima!' });
    C(inicio, anuncio); C(anuncio, menu); C(menu, marcar, 'output_1'); C(marcar, avisar);
    C(menu, gracias, 'output_2'); C(menu, gracias, 'output_4');
  }
  await guardarFlujo();
}

// ---------- editor ----------
async function abrirFlujo(id) {
  const r = await api('flujos', { accion:'obtener', linea_id: lineaActual, id });
  if (!r || r.status !== 'ok') { alert('No se pudo abrir el flujo'); return; }
  flujoAbierto = r.flujo;
  document.getElementById('flVistaLista').style.display = 'none';
  document.getElementById('flVistaEditor').style.display = 'flex';
  document.getElementById('edNombre').value = flujoAbierto.nombre;
  document.getElementById('edDisparador').value = flujoAbierto.disparador;
  document.getElementById('edPalabras').value = flujoAbierto.palabras || '';
  document.getElementById('edPalabras').style.display = flujoAbierto.disparador === 'palabra' ? 'inline-block' : 'none';
  document.getElementById('edActivo').checked = flujoAbierto.estado === 'activo';
  document.getElementById('botonGuardar').style.display = esAdmin() ? 'inline-flex' : 'none';
  pintarSelectCarpeta();

  const lienzo = document.getElementById('lienzo');
  lienzo.innerHTML = '';
  editor = new Drawflow(lienzo);
  editor.reroute = true;
  editor.start();
  importando = true;
  if (flujoAbierto.grafo && flujoAbierto.grafo.drawflow) {
    const g = JSON.parse(JSON.stringify(flujoAbierto.grafo));
    Object.values(g.drawflow.Home.data).forEach(n => { n.html = nodoHtml(n.name, n.data); });
    editor.import(g);
  } else {
    editor.addNode('inicio', 0, 1, 50, 140, 'nodo-inicio', {}, nodoHtml('inicio'), false);
  }
  importando = false;

  editor.on('nodeSelected', nid => abrirPanelNodo(nid));
  editor.on('nodeUnselected', () => cerrarPanelNodo());
  editor.on('nodeRemoved', () => { cerrarPanelNodo(); fotografiar(); });
  editor.on('nodeCreated', fotografiar);
  editor.on('connectionCreated', fotografiar);
  editor.on('connectionRemoved', fotografiar);
  editor.on('nodeMoved', marcarCambio);

  lienzo.insertAdjacentHTML('beforeend', '<div class="pista-lienzo">Toca una cajita para configurarla</div>');
  cerrarPanelNodo();
  pilaAtras = [JSON.stringify(editor.export())];
  pilaAdelante = [];
  pintarBotonesHistorial();
  reiniciarSim();
}

function volverALista() {
  document.getElementById('flVistaEditor').style.display = 'none';
  document.getElementById('flVistaLista').style.display = 'block';
  document.getElementById('simulador').classList.remove('abierto');
  cargarFlujos();
}
function flZoomIn(){ if(editor) editor.zoom_in(); }
function flZoomOut(){ if(editor) editor.zoom_out(); }
function flZoomReset(){ if(editor) editor.zoom_reset(); }

// ---------- carpetas (en el editor) ----------
function pintarSelectCarpeta() {
  const sel = document.getElementById('edCarpeta');
  const carpetas = [...new Set(flFlujos.map(f => f.carpeta).filter(Boolean))].sort();
  const actual = flujoAbierto.carpeta || '';
  sel.innerHTML = '<option value="">Sin carpeta</option>' +
    carpetas.map(c => `<option value="${escapar(c)}" ${c === actual ? 'selected' : ''}>${escapar(c)}</option>`).join('') +
    '<option value="__nueva">+ Carpeta nueva…</option>';
  sel.disabled = !esAdmin();
}
function carpetaCambia(sel) {
  if (sel.value === '__nueva') {
    const nombre = (prompt('Nombre de la carpeta (ej: Rifa Casa Santa Teresita):') || '').trim();
    if (!nombre) { sel.value = flujoAbierto.carpeta || ''; return; }
    flujoAbierto.carpeta = nombre;
    pintarSelectCarpeta();
  } else {
    flujoAbierto.carpeta = sel.value || null;
  }
}

// =============================================================================
// CAJITAS RESUMIDAS + PANEL LATERAL (patrón ManyChat/ChateaPro)
// =============================================================================
const TITULOS = {
  inicio: 'Inicio', mensaje: 'Mensaje', pregunta: 'Pregunta', botones: 'Botones',
  lista: 'Lista de opciones', condicion: 'Condición', accion: 'Acción',
  solicitud: 'Solicitud externa', asignar: 'Pasar a asesor', esperar: 'Esperar',
  aleatorio: 'Aleatorio (A/B)', irflujo: 'Ir a otro flujo',
  clasificar: 'Clasificar con IA', comentario: 'Comentario', etiquetar: 'Poner etiqueta'
};
const SALIDAS_TXT = {
  pregunta: ['respondió →', 'agotó reintentos →', 'no respondió →'],
  lista: ['eligió una opción →', 'escribió otra cosa →'],
  botones: ['botón 1 →', 'botón 2 →', 'botón 3 →', 'escribió otra cosa →'],
  condicion: ['SÍ cumple →', 'NO cumple →'],
  solicitud: ['funcionó →', 'falló →'],
  aleatorio: ['rama A →', 'rama B →'],
  clasificar: ['clasificó →', 'falló la IA →']
};
const OPERADOR_TXT = { contiene: 'contiene', no_contiene: 'NO contiene', es: 'es', mayor: 'es mayor que', menor: 'es menor que', vacio: 'está vacío' };
const ACCION_TXT = { poner_etiqueta: 'Poner etiqueta', quitar_etiqueta: 'Quitar etiqueta', establecer_campo: 'Establecer un campo' };
const corto = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const resVacio = (texto) => `<span class="res-vacio">${texto}</span>`;
const nombreEtiqueta = v => etiquetas.find(e => e.nombre === v || e.id === v)?.nombre || v || '—';

function resumenNodo(tipo, d) {
  d = d || {};
  const e = (t, n) => escapar(corto(t, n));
  switch (tipo) {
    case 'inicio': return 'Cuando el flujo se dispare, arranca por aquí.';
    case 'mensaje': {
      let extra = d.adjunto ? `Adjunta ${d.adjunto === 'imagen' ? 'una imagen' : 'un audio'}` : '';
      if (d.respuesta === 'botones') {
        const btns = [d.btn1, d.btn2, d.btn3].filter(Boolean).map(b => e(b, 22));
        extra += (extra ? ' · ' : '') + (btns.length ? 'Botones: ' + btns.join(' · ') : 'Botones (sin definir)');
      }
      if (d.respuesta === 'lista') {
        const n = (d.opciones || '').split('\n').filter(x => x.trim()).length;
        extra += (extra ? ' · ' : '') + 'Lista de ' + n + (n === 1 ? ' opción' : ' opciones');
      }
      return (d.texto ? '"' + e(d.texto, 95) + '"' : resVacio('Toca para escribir el mensaje')) +
        (extra ? `<div class="res-extra">${extra}</div>` : '');
    }
    case 'pregunta':
      return (d.texto ? '"' + e(d.texto, 80) + '"' : resVacio('Toca para escribir la pregunta')) +
        `<div class="res-extra">Espera ${({texto:'texto', numero:'un número', telefono:'un teléfono', correo:'un correo'})[d.tipo] || 'texto'}` +
        (d.campo ? ` · guarda en {{${escapar(d.campo)}}}` : '') + `</div>`;
    case 'botones': {
      const btns = [d.btn1, d.btn2, d.btn3].filter(Boolean).map(b => e(b, 22));
      return (d.texto ? '"' + e(d.texto, 70) + '"' : resVacio('Toca para escribir el mensaje')) +
        (btns.length ? `<div class="res-extra">Botones: ${btns.join(' · ')}</div>` : '');
    }
    case 'lista': {
      const n = (d.opciones || '').split('\n').filter(x => x.trim()).length;
      return (d.texto ? '"' + e(d.texto, 70) + '"' : resVacio('Toca para escribir el mensaje')) +
        `<div class="res-extra">${n}${n === 1 ? ' opción' : ' opciones'}${d.campo ? ` · guarda en {{${escapar(d.campo)}}}` : ''}</div>`;
    }
    case 'condicion': {
      const que = d.origen === 'campo' ? `{{${escapar(d.campo_cond || '?')}}}` : 'La respuesta';
      return `${que} <b>${OPERADOR_TXT[d.operador] || 'contiene'}</b>` +
        (d.operador === 'vacio' ? '' : (d.palabra ? ` "${e(d.palabra, 40)}"` : ' ' + resVacio('(elige las palabras)')));
    }
    case 'accion': {
      const a = ACCION_TXT[d.accion] || 'Acción';
      if (d.accion === 'establecer_campo') return `${a}: {{${escapar(d.campo || '?')}}} = "${e(d.valor, 35)}"`;
      return `${a}: "${escapar(nombreEtiqueta(d.etiqueta))}"`;
    }
    case 'solicitud':
      return `<b>${d.metodo || 'GET'}</b> ${d.url ? e(d.url, 60) : resVacio('(falta la URL)')}` +
        (d.ruta && d.campo ? `<div class="res-extra">${escapar(d.ruta)} → {{${escapar(d.campo)}}}</div>` : '');
    case 'aleatorio': return `Rama A: ${Number(d.pct) || 50}% · Rama B: ${100 - (Number(d.pct) || 50)}%`;
    case 'irflujo': {
      const f = flFlujos.find(x => x.id === d.flujo);
      return 'Continúa en: ' + (f ? '<b>' + escapar(f.nombre) + '</b>' : resVacio('(elige el flujo)'));
    }
    case 'asignar': {
      const m = miembros.find(x => x.user_id === d.miembro);
      return 'El chat pasa a ' + (m ? '<b>' + escapar(m.nombre || 'un asesor') + '</b>' : 'cualquiera del equipo') + '. Fin del flujo.';
    }
    case 'esperar': return `Espera <b>${d.horas || 24} horas</b> y sigue`;
    case 'clasificar': {
      const cats = (d.categorias || '').split('\n').map(l => l.split(':')[0].trim()).filter(Boolean);
      return (cats.length ? 'Categorías: <b>' + cats.map(escapar).join(' · ') + '</b>' : resVacio('Toca para definir las categorías')) +
        (d.campo ? `<div class="res-extra">guarda en {{${escapar(d.campo)}}}</div>` : '');
    }
    case 'etiquetar': return `Poner etiqueta: "${escapar(nombreEtiqueta(d.etiqueta))}"`;
    default: return '';
  }
}

function salidasTxtDe(tipo, d) {
  if (tipo === 'mensaje') {
    if (d?.respuesta === 'botones') return SALIDAS_TXT.botones;
    if (d?.respuesta === 'lista') return SALIDAS_TXT.lista;
    return [];
  }
  return SALIDAS_TXT[tipo] || [];
}

function nodoHtml(tipo, d) {
  if (tipo === 'comentario') return `<div class="nodo"><div class="cuerpo" style="padding-top:9px;">
    <textarea df-texto rows="3" placeholder="Nota para el equipo (el cliente nunca la ve)"></textarea></div></div>`;
  const salidas = salidasTxtDe(tipo, d).map(s => `<span>${s}</span>`).join('');
  return `<div class="nodo">
    <div class="cab"><span class="cubo c-${tipo === 'etiquetar' ? 'accion' : tipo}"></span><span class="cab-tit">${escapar((d && d.titulo) || TITULOS[tipo] || tipo)}</span></div>
    <div class="resumen">${resumenNodo(tipo, d)}</div>
    ${salidas ? `<div class="salidas">${salidas}</div>` : ''}</div>`;
}

// ---------- panel lateral de configuración ----------
let nodoPanelId = null;

function abrirPanelNodo(id) {
  const n = editor.getNodeFromId(id);
  if (!n || n.name === 'comentario') return;
  nodoPanelId = id;
  document.getElementById('simulador').classList.remove('abierto');
  document.getElementById('panelNodo').classList.add('abierto');
  pintarPanelNodo();
}
function cerrarPanelNodo() {
  nodoPanelId = null;
  document.getElementById('panelNodo').classList.remove('abierto');
}
function setDato(clave, valor, repintarPanel) {
  if (nodoPanelId == null) return;
  const n = editor.getNodeFromId(nodoPanelId);
  n.data[clave] = valor;
  editor.updateNodeDataFromId(nodoPanelId, n.data);
  const res = document.querySelector('#node-' + nodoPanelId + ' .resumen');
  if (res) res.innerHTML = resumenNodo(n.name, n.data);
  if (clave === 'titulo') {
    const tit = document.querySelector('#node-' + nodoPanelId + ' .cab-tit');
    if (tit) tit.textContent = valor || TITULOS[n.name];
  }
  if (repintarPanel) pintarPanelNodo();
  marcarCambio();
}

function pintarPanelNodo() {
  const n = editor.getNodeFromId(nodoPanelId);
  if (!n) return;
  document.getElementById('panelTitulo').innerHTML =
    `<span class="cubo c-${n.name === 'etiquetar' ? 'accion' : n.name}"></span>${TITULOS[n.name] || n.name}`;
  document.getElementById('panelCuerpo').innerHTML = formularioNodo(n.name, n.data || {});
}

// En Fase 1 los "campos" son texto libre (escribe la clave). El motor (Fase 2)
// guardará la respuesta del cliente bajo esa clave.
function selCampos(clave) {
  const n = editor.getNodeFromId(nodoPanelId);
  const val = escapar((n && n.data && n.data[clave]) || '');
  return `<input type="text" value="${val}" placeholder="ej: numero_elegido" oninput="setDato('${clave}', this.value)">`;
}

function formularioNodo(tipo, d) {
  const v = x => escapar(d[x] ?? '');
  const campoP = (label, html) => `<div class="campo-p"><label>${label}</label>${html}</div>`;
  const titulo = tipo === 'inicio' ? '' :
    campoP('Título de la cajita (opcional)', `<input type="text" value="${v('titulo')}" placeholder="${TITULOS[tipo]}" onchange="setDato('titulo', this.value)">`);

  switch (tipo) {
    case 'inicio': return `<div class="ayuda-p">Aquí arranca el flujo. El disparador (las palabras
      o "contacto nuevo") se elige arriba en la barra. Conecta la salida de esta cajita
      con el primer paso.</div>`;
    case 'mensaje': return titulo +
      campoP('Texto para el cliente (admite {{campos}})', `<textarea rows="5" oninput="setDato('texto', this.value)" placeholder="Escribe el mensaje…">${v('texto')}</textarea>`) +
      campoP('Adjuntar (opcional)', `<select onchange="setDato('adjunto', this.value, true)">
        <option value="" ${!d.adjunto ? 'selected' : ''}>Nada</option>
        <option value="imagen" ${d.adjunto === 'imagen' ? 'selected' : ''}>Imagen</option>
        <option value="audio" ${d.adjunto === 'audio' ? 'selected' : ''}>Nota de voz / audio</option></select>`) +
      (d.adjunto ? campoP('Link https del archivo', `<input type="url" value="${v('adjunto_url')}" placeholder="https://…" onchange="setDato('adjunto_url', this.value)">`) : '') +
      campoP('¿Cómo responde el cliente?', `<select onchange="cambiarRespuestaMensaje(this.value)">
        <option value="" ${!d.respuesta ? 'selected' : ''}>Sigue derecho (solo es un mensaje)</option>
        <option value="botones" ${d.respuesta === 'botones' ? 'selected' : ''}>Con botones (máx. 3)</option>
        <option value="lista" ${d.respuesta === 'lista' ? 'selected' : ''}>Con lista de opciones (máx. 10)</option></select>`) +
      (d.respuesta === 'botones'
        ? campoP('Botón 1', `<input type="text" value="${v('btn1')}" oninput="setDato('btn1', this.value)">`) +
          campoP('Botón 2 (opcional)', `<input type="text" value="${v('btn2')}" oninput="setDato('btn2', this.value)">`) +
          campoP('Botón 3 (opcional)', `<input type="text" value="${v('btn3')}" oninput="setDato('btn3', this.value)">`) +
          `<div class="ayuda-p">La cuarta salida es "escribió otra cosa".</div>` : '') +
      (d.respuesta === 'lista'
        ? campoP('Opciones (una por línea, máx. 10 — límite de WhatsApp)', `<textarea rows="5" oninput="setDato('opciones', this.value)" placeholder="Pagar con Nequi&#10;Pagar con Bancolombia&#10;Hablar con un asesor">${v('opciones')}</textarea>`) +
          campoP('Guardar lo elegido en', selCampos('campo')) : '');
    case 'pregunta': return titulo +
      campoP('La pregunta para el cliente', `<textarea rows="3" oninput="setDato('texto', this.value)">${v('texto')}</textarea>`) +
      campoP('Tipo de respuesta esperada', `<select onchange="setDato('tipo', this.value)">
        ${['texto|Texto (cualquier cosa)', 'numero|Número', 'telefono|Teléfono', 'correo|Correo'].map(o => { const p = o.split('|');
          return `<option value="${p[0]}" ${(d.tipo || 'texto') === p[0] ? 'selected' : ''}>${p[1]}</option>`; }).join('')}</select>`) +
      campoP('Guardar la respuesta en', selCampos('campo')) +
      `<div style="display:flex; gap:10px;">
        <div style="flex:1;">${campoP('Reintentos máx.', `<input type="number" min="0" max="5" value="${d.reintentos ?? 3}" onchange="setDato('reintentos', this.value)">`)}</div>
        <div style="flex:1;">${campoP('Si no responde en (horas)', `<input type="number" min="1" value="${d.sin_horas ?? 24}" onchange="setDato('sin_horas', this.value)">`)}</div>
      </div>` +
      campoP('Botón "saltar" (opcional)', `<input type="text" value="${v('saltar')}" placeholder="Ej: Prefiero no decir" onchange="setDato('saltar', this.value)">`) +
      `<div class="ayuda-p">Salidas: <b>respondió</b> (válido y guardado), <b>agotó reintentos</b>
        (respondió otra cosa demasiadas veces) y <b>no respondió</b> (pasaron las horas en silencio).</div>`;
    case 'botones': return titulo +
      campoP('El mensaje con las opciones', `<textarea rows="3" oninput="setDato('texto', this.value)">${v('texto')}</textarea>`) +
      campoP('Botón 1', `<input type="text" value="${v('btn1')}" oninput="setDato('btn1', this.value)">`) +
      campoP('Botón 2 (opcional)', `<input type="text" value="${v('btn2')}" oninput="setDato('btn2', this.value)">`) +
      campoP('Botón 3 (opcional)', `<input type="text" value="${v('btn3')}" oninput="setDato('btn3', this.value)">`) +
      `<div class="ayuda-p">Máximo 3 botones — el límite de WhatsApp. La cuarta salida es "escribió otra cosa".</div>`;
    case 'lista': return titulo +
      campoP('El mensaje que acompaña la lista', `<textarea rows="3" oninput="setDato('texto', this.value)">${v('texto')}</textarea>`) +
      campoP('Opciones (una por línea, máx. 10 — límite de WhatsApp)', `<textarea rows="6" oninput="setDato('opciones', this.value)" placeholder="Pagar con Nequi&#10;Pagar con Bancolombia&#10;Hablar con un asesor">${v('opciones')}</textarea>`) +
      campoP('Guardar lo elegido en', selCampos('campo'));
    case 'condicion': return titulo +
      campoP('Qué se revisa', `<select onchange="setDato('origen', this.value, true)">
        <option value="respuesta" ${d.origen !== 'campo' ? 'selected' : ''}>La última respuesta del cliente</option>
        <option value="campo" ${d.origen === 'campo' ? 'selected' : ''}>Un campo personalizado</option></select>`) +
      (d.origen === 'campo' ? campoP('Campo', selCampos('campo_cond')) : '') +
      campoP('Cómo se compara', `<select onchange="setDato('operador', this.value, true)">
        ${[['contiene','contiene alguna de estas palabras'],['no_contiene','NO contiene ninguna'],['es','es exactamente'],['mayor','es mayor que (número)'],['menor','es menor que (número)'],['vacio','está vacío']]
          .map(p => `<option value="${p[0]}" ${(d.operador || 'contiene') === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>`) +
      (d.operador === 'vacio' ? '' : campoP('Palabras o valor (separa con comas)', `<input type="text" value="${v('palabra')}" placeholder="si, claro, dale" oninput="setDato('palabra', this.value)">`));
    case 'accion': return titulo +
      campoP('Qué hace', `<select onchange="setDato('accion', this.value, true)">
        ${Object.keys(ACCION_TXT).map(val => `<option value="${val}" ${(d.accion || 'poner_etiqueta') === val ? 'selected' : ''}>${ACCION_TXT[val]}</option>`).join('')}</select>`) +
      ((d.accion || 'poner_etiqueta').includes('etiqueta')
        ? campoP('Etiqueta', `<select onchange="setDato('etiqueta', this.value)">
            ${etiquetas.map(e2 => `<option value="${escapar(e2.nombre)}" ${(d.etiqueta === e2.nombre || d.etiqueta === e2.id) ? 'selected' : ''}>${escapar(e2.nombre)}</option>`).join('') || '<option value="">(crea etiquetas en la bandeja)</option>'}</select>`) : '') +
      (d.accion === 'establecer_campo'
        ? campoP('Campo', selCampos('campo')) +
          campoP('Valor (admite {{otros_campos}})', `<input type="text" value="${v('valor')}" placeholder="Ej: {{numero_elegido}} confirmado" oninput="setDato('valor', this.value)">`) : '');
    case 'solicitud': return titulo +
      `<div style="display:flex; gap:8px;">
        <div style="width:90px; flex-shrink:0;">${campoP('Método', `<select onchange="setDato('metodo', this.value, true)">
          <option ${d.metodo !== 'POST' ? 'selected' : ''}>GET</option><option ${d.metodo === 'POST' ? 'selected' : ''}>POST</option></select>`)}</div>
        <div style="flex:1;">${campoP('URL (https)', `<input type="url" value="${v('url')}" placeholder="https://api.tuservicio.com/…" onchange="setDato('url', this.value)">`)}</div>
      </div>` +
      (d.metodo === 'POST' ? campoP('Cuerpo (JSON, admite {{campos}})', `<textarea rows="3" oninput="setDato('cuerpo', this.value)" placeholder='{"numero": "{{numero_elegido}}"}'>${v('cuerpo')}</textarea>`) : '') +
      campoP('De la respuesta, tomar (opcional)', `<input type="text" value="${v('ruta')}" placeholder="Ej: data.disponible" onchange="setDato('ruta', this.value)">`) +
      campoP('y guardarlo en', selCampos('campo'));
    case 'aleatorio': return titulo +
      campoP('Porcentaje que va por la rama A', `<input type="number" min="1" max="99" value="${d.pct ?? 50}" onchange="setDato('pct', this.value)">`) +
      `<div class="ayuda-p">Para probar dos versiones de un mensaje (prueba A/B).</div>`;
    case 'irflujo': return titulo +
      campoP('Continuar en el flujo', `<select onchange="setDato('flujo', this.value)">
        <option value="">(elige el flujo)</option>
        ${flFlujos.filter(f => f.id !== flujoAbierto?.id).map(f => `<option value="${f.id}" ${d.flujo === f.id ? 'selected' : ''}>${escapar(f.nombre)}</option>`).join('')}</select>`) +
      `<div class="ayuda-p">Este flujo termina y el otro arranca desde su Inicio.</div>`;
    case 'asignar': return titulo +
      campoP('Asignar a', `<select onchange="setDato('miembro', this.value)">
        <option value="">Cualquiera del equipo</option>
        ${miembros.map(m => `<option value="${m.user_id}" ${d.miembro === m.user_id ? 'selected' : ''}>${escapar(m.nombre || 'Miembro')}</option>`).join('')}</select>`) +
      `<div class="ayuda-p">El flujo termina y atiende un humano (o lo retoma Liliana, según la configuración del agente).</div>`;
    case 'esperar': return titulo +
      campoP('Esperar (horas)', `<input type="number" min="1" value="${d.horas ?? 24}" onchange="setDato('horas', this.value)">`);
    case 'clasificar': return titulo +
      campoP('Categorías (una por línea: Nombre: cuándo aplica)', `<textarea rows="7" oninput="setDato('categorias', this.value)" placeholder="Informacion: quiere saber premios o fechas&#10;Precio: pregunta cuánto vale la boleta&#10;Pago: pide cuentas o medios de pago&#10;Numeros: pide los números disponibles">${v('categorias')}</textarea>`) +
      campoP('Contexto para la IA (opcional)', `<textarea rows="3" oninput="setDato('contexto', this.value)" placeholder="Ej: ya recibió el precio y la pregunta de los premios">${v('contexto')}</textarea>`) +
      campoP('Guardar la categoría en', selCampos('campo')) +
      `<div class="ayuda-p">La IA lee la última respuesta del cliente y contesta SOLO el nombre
        de una categoría (o "Ninguna"). Después enruta con cajitas de Condición por ese campo.
        Aquí en el simulador clasifica por palabras; con clientes reales (Fase 2) usará la IA.</div>`;
    case 'etiquetar': return titulo +
      campoP('Etiqueta', `<select onchange="setDato('etiqueta', this.value)">
        ${etiquetas.map(e2 => `<option value="${escapar(e2.nombre)}" ${(d.etiqueta === e2.nombre || d.etiqueta === e2.id) ? 'selected' : ''}>${escapar(e2.nombre)}</option>`).join('')}</select>`);
    default: return '<div class="ayuda-p">Esta cajita no tiene opciones.</div>';
  }
}

function cambiarRespuestaMensaje(v) {
  if (nodoPanelId == null) return;
  const id = nodoPanelId;
  const n = editor.getNodeFromId(id);
  n.data.respuesta = v;
  editor.updateNodeDataFromId(id, n.data);
  const objetivo = v === 'botones' ? 4 : v === 'lista' ? 2 : 1;
  let actuales = Object.keys(editor.getNodeFromId(id).outputs).length;
  while (actuales < objetivo) { editor.addNodeOutput(id); actuales++; }
  while (actuales > objetivo) { editor.removeNodeOutput(id, 'output_' + actuales); actuales--; }
  const contenido = document.querySelector('#node-' + id + ' .drawflow_content_node');
  if (contenido) contenido.innerHTML = nodoHtml('mensaje', n.data);
  editor.updateConnectionNodes('node-' + id);
  pintarPanelNodo();
  marcarCambio();
}

// ---------- deshacer / rehacer ----------
let pilaAtras = [], pilaAdelante = [], importando = false, timerCambio = null;
function fotografiar() {
  if (importando || !editor) return;
  const foto = JSON.stringify(editor.export());
  if (pilaAtras[pilaAtras.length - 1] === foto) return;
  pilaAtras.push(foto);
  if (pilaAtras.length > 40) pilaAtras.shift();
  pilaAdelante = [];
  pintarBotonesHistorial();
}
function marcarCambio() { clearTimeout(timerCambio); timerCambio = setTimeout(fotografiar, 700); }
function deshacer() {
  if (pilaAtras.length < 2) return;
  pilaAdelante.push(pilaAtras.pop());
  restaurarFoto(pilaAtras[pilaAtras.length - 1]);
}
function rehacer() {
  if (!pilaAdelante.length) return;
  const foto = pilaAdelante.pop();
  pilaAtras.push(foto);
  restaurarFoto(foto);
}
function restaurarFoto(foto) {
  importando = true;
  cerrarPanelNodo();
  editor.import(JSON.parse(foto));
  importando = false;
  pintarBotonesHistorial();
}
function pintarBotonesHistorial() {
  const b1 = document.getElementById('botonDeshacer'), b2 = document.getElementById('botonRehacer');
  if (b1) b1.style.opacity = pilaAtras.length > 1 ? 1 : .4;
  if (b2) b2.style.opacity = pilaAdelante.length ? 1 : .4;
}
document.addEventListener('keydown', e => {
  const ed = document.getElementById('flVistaEditor');
  if (!ed || ed.style.display !== 'flex') return;
  if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); rehacer(); }
});

function salidasDe(tipo) {
  return tipo === 'botones' ? 4
    : tipo === 'pregunta' ? 3
    : (tipo === 'condicion' || tipo === 'solicitud' || tipo === 'aleatorio' || tipo === 'lista' || tipo === 'clasificar') ? 2
    : (tipo === 'asignar' || tipo === 'irflujo' || tipo === 'comentario') ? 0 : 1;
}
function agregarNodo(tipo) {
  if (!editor) return;
  const entradas = tipo === 'comentario' ? 0 : 1;
  const datos = {
    texto: '', adjunto: '', adjunto_url: '', respuesta: '', tipo: 'texto', campo: '', palabra: '',
    btn1: '', btn2: '', btn3: '', opciones: '', reintentos: 3, saltar: '', sin_horas: 24,
    accion: 'poner_etiqueta', etiqueta: etiquetas[0]?.nombre || '', valor: '', pct: 50, flujo: '',
    origen: 'respuesta', campo_cond: '', operador: 'contiene',
    metodo: 'GET', url: '', cuerpo: '', ruta: '', miembro: '', horas: 24,
    categorias: '', contexto: ''
  };
  const x = 90 + Math.random() * 360, y = 70 + Math.random() * 260;
  const id = editor.addNode(tipo, entradas, salidasDe(tipo), x, y, 'nodo-' + tipo, datos, nodoHtml(tipo, datos), false);
  if (tipo !== 'comentario') abrirPanelNodo(id);
}

function eliminarNodoSeleccionado() {
  if (!editor || !editor.node_selected) return;
  const id = editor.node_selected.id;
  if (editor.getNodeFromId(id.replace('node-', '')).name === 'inicio') return;
  cerrarPanelNodo();
  editor.removeNodeId(id);
}

function duplicarNodo() {
  if (!editor || !editor.node_selected) return;
  const id = editor.node_selected.id.replace('node-', '');
  const n = editor.getNodeFromId(id);
  if (!n || n.name === 'inicio') return;
  editor.addNode(n.name, Object.keys(n.inputs).length, Object.keys(n.outputs).length,
    n.pos_x + 50, n.pos_y + 50, 'nodo-' + n.name, JSON.parse(JSON.stringify(n.data)), nodoHtml(n.name, n.data), false);
}

async function eliminarFlujo() {
  if (!esAdmin()) return;
  if (!confirm('¿Eliminar este flujo por completo? No se puede deshacer.')) return;
  await api('flujos', { accion:'eliminar', linea_id: lineaActual, id: flujoAbierto.id });
  volverALista();
}

async function guardarFlujo() {
  const nombre = document.getElementById('edNombre').value.trim() || 'Flujo sin nombre';
  const disparador = document.getElementById('edDisparador').value;
  const palabras = document.getElementById('edPalabras').value.trim();
  const estado = document.getElementById('edActivo').checked ? 'activo' : 'borrador';
  const grafo = editor.export();
  const boton = document.getElementById('botonGuardar');
  boton.disabled = true; boton.textContent = 'Guardando…';
  const r = await api('flujos', {
    accion:'guardar', linea_id: lineaActual, id: flujoAbierto.id,
    nombre, disparador, palabras: palabras || null, estado, grafo,
    carpeta: flujoAbierto.carpeta || null
  });
  boton.disabled = false;
  const error = !r || r.status !== 'ok';
  boton.textContent = error ? 'Error al guardar' : 'Guardado ✓';
  if (!error) Object.assign(flujoAbierto, { nombre, disparador, palabras, estado, grafo });
  setTimeout(() => { boton.textContent = 'Guardar'; }, 1800);
}

// ---------- simulador ----------
let sim = { esperando: null, ultimaRespuesta: '', pasos: 0, variables: {} };

function alternarSimulador() {
  const panel = document.getElementById('simulador');
  panel.classList.toggle('abierto');
  if (panel.classList.contains('abierto')) { cerrarPanelNodo(); reiniciarSim(true); }
}
function reiniciarSim(correr) {
  sim = { esperando: null, ultimaRespuesta: '', pasos: 0, variables: {} };
  pintarVars();
  document.getElementById('simChat').innerHTML = '';
  if (correr || document.getElementById('simulador').classList.contains('abierto')) {
    simSistema(flujoAbierto.disparador === 'nuevo_contacto'
      ? 'El flujo se dispararía cuando un contacto nuevo escriba.'
      : 'El flujo se dispararía con las palabras: ' + (document.getElementById('edPalabras').value || '—'));
    correrDesde(nodoInicio());
  }
}
function nodos() { return editor.export().drawflow.Home.data; }
function nodoInicio() { return Object.values(nodos()).find(n => n.name === 'inicio'); }
function siguienteDe(nodo, salida) {
  const conns = nodo.outputs?.[salida || 'output_1']?.connections || [];
  if (!conns.length) return null;
  return nodos()[conns[0].node];
}
function vars(t) {
  return String(t || '').replace(/{{\s*([\w-]+)\s*}}/g, (_, k) => sim.variables[k] ?? '');
}
function pintarVars() {
  const caja = document.getElementById('simVars');
  const claves = Object.keys(sim.variables);
  caja.innerHTML = claves.length
    ? claves.map(k => `<span class="sim-var">${escapar(k)}: ${escapar(String(sim.variables[k]).slice(0, 24))}</span>`).join('')
    : '<span class="sim-var" style="opacity:.6">sin campos guardados aún</span>';
}

const VALIDA = {
  texto: t => true,
  numero: t => /\d/.test(t) && /^[\s$.,\d-]+$/.test(t),
  telefono: t => t.replace(/\D/g, '').length >= 7,
  correo: t => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim())
};
const NOMBRE_TIPO = { numero: 'un número', telefono: 'un teléfono', correo: 'un correo' };

async function correrDesde(nodo) {
  let actual = nodo;
  while (actual && sim.pasos < 50) {
    sim.pasos++;
    const d = actual.data || {};
    switch (actual.name) {
      case 'inicio': actual = siguienteDe(actual); continue;
      case 'mensaje': {
        if (d.respuesta === 'botones') {
          const botones = [d.btn1, d.btn2, d.btn3].map(b => vars(b).trim()).filter(Boolean);
          simBotConBotones(vars(d.texto) || '(mensaje vacío)', botones); sim.esperando = actual; return;
        }
        if (d.respuesta === 'lista') {
          const opciones = (d.opciones || '').split('\n').map(o => vars(o).trim()).filter(Boolean).slice(0, 10);
          simBotConBotones(vars(d.texto) || '(mensaje vacío)', opciones); sim.esperando = actual; return;
        }
        simBot(vars(d.texto) || '(mensaje vacío)', d.adjunto, d.adjunto_url);
        actual = siguienteDe(actual); continue;
      }
      case 'pregunta': {
        const saltar = vars(d.saltar || '').trim();
        if (saltar) simBotConBotones(vars(d.texto) || '(pregunta vacía)', [saltar]);
        else simBot(vars(d.texto) || '(pregunta vacía)');
        sim.esperando = actual; sim.intentos = 0;
        simBurbuja('', 'sistema', `<button class="sim-btn" onclick="simSilencio()">Simular que no responde en ${Number(d.sin_horas) || 24}h</button>`);
        return;
      }
      case 'lista': {
        const opciones = (d.opciones || '').split('\n').map(o => vars(o).trim()).filter(Boolean).slice(0, 10);
        simBotConBotones(vars(d.texto) || '(mensaje vacío)', opciones); sim.esperando = actual; return;
      }
      case 'botones': {
        const botones = [d.btn1, d.btn2, d.btn3].map(b => vars(b).trim()).filter(Boolean);
        simBotConBotones(vars(d.texto) || '(mensaje vacío)', botones); sim.esperando = actual; return;
      }
      case 'condicion': {
        const origen = (d.origen === 'campo') ? String(sim.variables[d.campo_cond] ?? '') : sim.ultimaRespuesta;
        const op = d.operador || 'contiene';
        const valor = vars(d.palabra || '');
        let cumple;
        if (op === 'contiene' || op === 'no_contiene') {
          const palabras = valor.toLowerCase().split(',').map(p => p.trim()).filter(Boolean);
          const tiene = palabras.some(p => origen.toLowerCase().includes(p));
          cumple = op === 'contiene' ? tiene : !tiene;
        } else if (op === 'es') {
          cumple = origen.trim().toLowerCase() === valor.trim().toLowerCase();
        } else if (op === 'mayor' || op === 'menor') {
          const a = parseFloat(String(origen).replace(/[^\d.-]/g, '')), b = parseFloat(String(valor).replace(/[^\d.-]/g, ''));
          cumple = !isNaN(a) && !isNaN(b) && (op === 'mayor' ? a > b : a < b);
        } else if (op === 'vacio') { cumple = !origen.trim(); }
        const queSeRevisa = d.origen === 'campo' ? '{{' + (d.campo_cond || '?') + '}} = "' + origen + '"' : 'la respuesta';
        simSistema('Condición sobre ' + queSeRevisa + ' (' + op + ' "' + valor + '"): ' + (cumple ? 'SÍ cumple' : 'NO cumple'));
        actual = siguienteDe(actual, cumple ? 'output_1' : 'output_2'); continue;
      }
      case 'accion': {
        if (d.accion === 'establecer_campo') {
          if (d.campo) { sim.variables[d.campo] = vars(d.valor); simSistema('Campo {{' + d.campo + '}} = "' + sim.variables[d.campo] + '"'); pintarVars(); }
          else simSistema('(la acción no tiene campo elegido)');
        } else {
          simSistema((d.accion === 'quitar_etiqueta' ? 'Se quitaría' : 'Se pondría') + ' la etiqueta "' + nombreEtiqueta(d.etiqueta) + '"');
        }
        actual = siguienteDe(actual); continue;
      }
      case 'etiquetar': { simSistema('Se pondría la etiqueta "' + nombreEtiqueta(d.etiqueta) + '"'); actual = siguienteDe(actual); continue; }
      case 'solicitud': {
        const url = vars(d.url);
        if (!/^https:\/\//i.test(url)) { simSistema('Solicitud externa: la URL debe empezar con https://'); actual = siguienteDe(actual, 'output_2'); continue; }
        simSistema('Llamando ' + (d.metodo || 'GET') + ' ' + url.slice(0, 60) + '…');
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 6000);
          const opciones = { method: d.metodo || 'GET', signal: ctl.signal };
          if (d.metodo === 'POST' && d.cuerpo) { opciones.headers = { 'Content-Type': 'application/json' }; opciones.body = vars(d.cuerpo); }
          const r = await fetch(url, opciones);
          clearTimeout(t);
          let valor = '(estado ' + r.status + ')';
          if (d.ruta) {
            const json = await r.json();
            valor = d.ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), json);
            if (d.campo) { sim.variables[d.campo] = String(valor ?? ''); pintarVars(); }
          }
          simSistema('Respondió ' + r.status + (d.ruta ? ' · ' + d.ruta + ' = ' + JSON.stringify(valor).slice(0, 60) : ''));
          actual = siguienteDe(actual, r.ok ? 'output_1' : 'output_2'); continue;
        } catch (e) {
          simSistema('La solicitud falló desde el navegador (' + (e.name === 'AbortError' ? 'tardó demasiado' : e.message) + '). En producción la hace el servidor.');
          actual = siguienteDe(actual, 'output_2'); continue;
        }
      }
      case 'clasificar': {
        const respuesta = sim.ultimaRespuesta.trim();
        const categorias = (d.categorias || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (!categorias.length) { simSistema('La cajita de IA no tiene categorías — caería por "falló la IA".'); actual = siguienteDe(actual, 'output_2'); continue; }
        const nombres = categorias.map(l => l.split(':')[0].trim()).filter(Boolean);
        const r = respuesta.toLowerCase();
        let categoria = nombres.find(n => {
          const linea = categorias.find(l => l.startsWith(n)) || '';
          return [n, ...linea.split(':').slice(1).join(':').split(/[,;]/)].some(p => p.trim() && r.includes(p.trim().toLowerCase()));
        }) || 'Ninguna';
        if (!nombres.includes(categoria)) categoria = 'Ninguna';
        if (d.campo) { sim.variables[d.campo] = categoria; pintarVars(); }
        simSistema('IA clasificó (simulado por palabras): "' + categoria + '"' + (d.campo ? ' → guardado en {{' + d.campo + '}}' : ''));
        actual = siguienteDe(actual, 'output_1'); continue;
      }
      case 'comentario': return;
      case 'asignar': {
        const m = miembros.find(x => x.user_id === d.miembro);
        simSistema('El chat pasaría a ' + (m?.nombre || 'un asesor del equipo') + '. Fin del flujo.'); return;
      }
      case 'esperar': { simSistema('Esperaría ' + (d.horas || '?') + ' horas y seguiría'); actual = siguienteDe(actual); continue; }
      case 'aleatorio': {
        const pct = Math.min(99, Math.max(1, Number(d.pct) || 50));
        const ramaA = Math.random() * 100 < pct;
        simSistema('Aleatorio: cayó en la rama ' + (ramaA ? 'A (' + pct + '%)' : 'B (' + (100 - pct) + '%)'));
        actual = siguienteDe(actual, ramaA ? 'output_1' : 'output_2'); continue;
      }
      case 'irflujo': {
        const otro = flFlujos.find(f => f.id === d.flujo);
        simSistema('Continuaría en el flujo "' + (otro?.nombre || '—') + '" desde su Inicio. Fin de este flujo.'); return;
      }
      default: actual = siguienteDe(actual);
    }
  }
  if (sim.pasos >= 50) simSistema('(el flujo tiene un ciclo: revisa las flechas)');
  else simSistema('Fin del flujo');
}

function simResponder() {
  const caja = document.getElementById('simTexto');
  const texto = caja.value.trim();
  if (!texto) return;
  caja.value = '';
  simCliente(texto);
  sim.ultimaRespuesta = texto;
  if (!sim.esperando) { simSistema('(el flujo no estaba esperando respuesta — dale Reiniciar para volver a probar)'); return; }
  const d = sim.esperando.data || {};
  const modo = sim.esperando.name === 'mensaje' ? (d.respuesta || '') : sim.esperando.name;
  if (modo === 'botones') {
    const botones = [d.btn1, d.btn2, d.btn3].map(b => vars(b).trim());
    const idx = botones.findIndex(b => b && b.toLowerCase() === texto.toLowerCase());
    const desde = sim.esperando; sim.esperando = null; apagarBotones();
    correrDesde(siguienteDe(desde, 'output_' + (idx >= 0 ? idx + 1 : 4))); return;
  }
  if (modo === 'lista') {
    const opciones = (d.opciones || '').split('\n').map(o => vars(o).trim()).filter(Boolean);
    const eligio = opciones.find(o => o.toLowerCase() === texto.toLowerCase());
    const desde = sim.esperando; sim.esperando = null; apagarBotones();
    if (eligio && d.campo) { sim.variables[d.campo] = eligio; simSistema('Guardado en {{' + d.campo + '}}'); pintarVars(); }
    correrDesde(siguienteDe(desde, eligio ? 'output_1' : 'output_2')); return;
  }
  const tipo = d.tipo || 'texto';
  if (!VALIDA[tipo](texto)) {
    sim.intentos = (sim.intentos || 0) + 1;
    const max = Number(d.reintentos ?? 3);
    if (sim.intentos > max) {
      simSistema('Se agotaron los ' + max + ' reintentos — sigue por la rama "agotó reintentos".');
      const desde = sim.esperando; sim.esperando = null; apagarBotones();
      correrDesde(siguienteDe(desde, 'output_2') || siguienteDe(desde, 'output_1')); return;
    }
    simSistema('Eso no parece ' + (NOMBRE_TIPO[tipo] || tipo) + ' — volvería a preguntar (intento ' + sim.intentos + ' de ' + max + ').');
    return;
  }
  if (d.campo) { sim.variables[d.campo] = texto; simSistema('Guardado en {{' + d.campo + '}}'); pintarVars(); }
  const desde = sim.esperando; sim.esperando = null;
  correrDesde(siguienteDe(desde));
}

function simBotConBotones(t, botones) {
  const html = botones.map((b, i) => `<button class="sim-btn" onclick="simBotonClick(${i + 1}, this.textContent)">${escapar(b)}</button>`).join('');
  simBurbuja(t, 'bot', `<div class="sim-botonera">${html}</div>`);
}
function simBotonClick(i, texto) {
  if (!sim.esperando) return;
  const desde = sim.esperando;
  const d = desde.data || {};
  const modo = desde.name === 'mensaje' ? (d.respuesta || '') : desde.name;
  simCliente(texto); sim.ultimaRespuesta = texto; sim.esperando = null; apagarBotones();
  if (modo === 'botones') { correrDesde(siguienteDe(desde, 'output_' + i)); }
  else if (modo === 'lista') {
    if (d.campo) { sim.variables[d.campo] = texto; simSistema('Guardado en {{' + d.campo + '}}'); pintarVars(); }
    correrDesde(siguienteDe(desde, 'output_1'));
  } else if (desde.name === 'pregunta') { simSistema('Saltó la pregunta (no se guarda nada).'); correrDesde(siguienteDe(desde, 'output_1')); }
}
function apagarBotones() { document.querySelectorAll('#simChat .sim-btn').forEach(b => { b.disabled = true; b.style.opacity = .5; }); }
function simSilencio() {
  if (!sim.esperando || sim.esperando.name !== 'pregunta') return;
  const desde = sim.esperando; sim.esperando = null; apagarBotones();
  simSistema('Pasaron ' + (Number(desde.data?.sin_horas) || 24) + ' horas sin respuesta — sigue por la rama "no respondió".');
  correrDesde(siguienteDe(desde, 'output_3'));
}
function simBot(t, adjunto, url) {
  let extra = '';
  if (adjunto === 'imagen' && url) extra = `<img src="${escapar(url)}" loading="lazy">`;
  if (adjunto === 'audio' && url) extra = `<audio controls src="${escapar(url)}"></audio>`;
  simBurbuja(t, 'bot', extra);
}
function simCliente(t) { simBurbuja(t, 'cliente'); }
function simSistema(t) { simBurbuja(t, 'sistema'); }
function simBurbuja(t, clase, extraHtml) {
  const chat = document.getElementById('simChat');
  chat.insertAdjacentHTML('beforeend', `<div class="sim-burbuja ${clase}">${escapar(t)}${extraHtml || ''}</div>`);
  chat.scrollTop = chat.scrollHeight;
}
