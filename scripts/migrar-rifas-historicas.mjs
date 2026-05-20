// migrar-rifas-historicas.mjs
// Migra los CSVs de rifas pasadas (Apto Papá y Perla Roja) a las tablas históricas.
// Ejecutar UNA SOLA VEZ:  node scripts/migrar-rifas-historicas.mjs
//
// Requiere que en el .env.local estén: SUPABASE_URL y SUPABASE_ANON_KEY
// (las tablas históricas no tienen RLS, así que ANON_KEY es suficiente).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Cargar .env.local manualmente (sin dotenv para no añadir dependencias)
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const linea of readFileSync(envPath, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RIFAS = {
  apto_papa: {
    id: '1a482ea1-b159-4559-94f7-0a20c9441b05',
    nombre: 'Apartamento de papá - 4TA RIFA',
    fecha_archivado: '2026-04-12T19:00:00-05:00',
  },
  perla_roja: {
    id: '3d95212f-81ec-4cad-85e2-577abed1acb7',
    nombre: 'La Perla Roja - 5TA RIFA',
    fecha_archivado: '2026-05-11T10:52:54-05:00',
  },
};

// Carpeta donde están los CSVs (en Google Drive del usuario)
const CARPETA_CSV = process.env.CARPETA_CSV || 'G:\\Mi unidad\\Base de datos_rifas';

// ─── Parser de CSV (soporta comillas y comas dentro de campos) ──────────────
function parseCSV(texto) {
  const filas = [];
  let actual = [], campo = '', enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') { enComillas = false; }
      else { campo += c; }
    } else {
      if (c === '"') enComillas = true;
      else if (c === ',') { actual.push(campo); campo = ''; }
      else if (c === '\n') { actual.push(campo); filas.push(actual); actual = []; campo = ''; }
      else if (c === '\r') { /* ignorar */ }
      else { campo += c; }
    }
  }
  if (campo.length || actual.length) { actual.push(campo); filas.push(actual); }
  const cabecera = filas.shift();
  return filas.filter(f => f.length === cabecera.length).map(f => {
    const obj = {};
    cabecera.forEach((col, idx) => { obj[col.trim()] = f[idx]; });
    return obj;
  });
}

function aNumero(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function aTexto(v)  { return (v == null || v === '') ? null : String(v); }
function aBool(v)   { if (v == null || v === '') return null; return v === 'true' || v === 't' || v === '1'; }

async function insertarEnLotes(tabla, filas, tamanoLote = 500) {
  let exito = 0;
  for (let i = 0; i < filas.length; i += tamanoLote) {
    const lote = filas.slice(i, i + tamanoLote);
    const { error } = await supabase.from(tabla).insert(lote);
    if (error) {
      console.error(`  Error lote ${i / tamanoLote + 1}:`, error.message);
      throw error;
    }
    exito += lote.length;
    process.stdout.write(`\r  ${exito}/${filas.length}`);
  }
  process.stdout.write('\n');
  return exito;
}

// ─── PASO 1: Importar abonos de Apto Papá (CSV) ─────────────────────────────
async function importarAbonosAptoPapa() {
  console.log('\n📂 Importando abonos de Apto Papá desde CSV...');
  const rifa = RIFAS.apto_papa;

  const { count: yaHay } = await supabase
    .from('abonos_historico')
    .select('*', { count: 'exact', head: true })
    .eq('rifa_id', rifa.id);

  if (yaHay && yaHay > 0) {
    console.log(`  Ya hay ${yaHay} filas, salto este paso (borra con DELETE para reimportar).`);
    return;
  }

  const ruta = join(CARPETA_CSV, 'abonos_apto_papa.csv');
  if (!existsSync(ruta)) { console.log(`  No encontré ${ruta}`); return; }

  const filas = parseCSV(readFileSync(ruta, 'utf8'));
  console.log(`  ${filas.length} filas en el CSV.`);

  const aInsertar = filas.map(f => ({
    rifa_id: rifa.id,
    rifa_nombre: rifa.nombre,
    fecha_archivado: rifa.fecha_archivado,
    numero_boleta: aTexto(f.numero_boleta),
    monto: aNumero(f.monto),
    fecha_pago: aTexto(f.fecha_pago),
    referencia_transferencia: aTexto(f.referencia_transferencia),
    metodo_pago: aTexto(f.metodo_pago),
    asesor: aTexto(f.asesor),
    tipo: aTexto(f.tipo) || '4cifras',
    origen: aTexto(f.origen),
    id_transferencia: aTexto(f.id_transferencia),
  }));

  const insertados = await insertarEnLotes('abonos_historico', aInsertar);
  console.log(`✅ Apto Papá: ${insertados} abonos insertados`);
}

// ─── PASO 2: Importar snapshot de boletas de Perla Roja (CSV) ───────────────
async function importarBoletasPerlaRoja() {
  console.log('\n📂 Importando snapshot de boletas de Perla Roja desde CSV...');
  const rifa = RIFAS.perla_roja;

  const { count: yaHay } = await supabase
    .from('boletas_historico')
    .select('*', { count: 'exact', head: true })
    .eq('rifa_id', rifa.id);

  if (yaHay && yaHay > 0) {
    console.log(`  Ya hay ${yaHay} filas, salto este paso.`);
    return;
  }

  const ruta = join(CARPETA_CSV, 'abonos_la_perla_roja.csv');
  if (!existsSync(ruta)) { console.log(`  No encontré ${ruta}`); return; }

  const filas = parseCSV(readFileSync(ruta, 'utf8'));
  console.log(`  ${filas.length} filas en el CSV.`);

  const aInsertar = filas.map(f => ({
    rifa_id: rifa.id,
    rifa_nombre: rifa.nombre,
    fecha_archivado: rifa.fecha_archivado,
    numero: aTexto(f.numero),
    estado: aTexto(f.estado),
    nombre_cliente: aTexto(f.nombre_cliente),
    telefono_cliente: aTexto(f.telefono_cliente),
    total_abonado: aNumero(f.total_abonado),
    saldo_restante: aNumero(f.saldo_restante),
    precio_total: aNumero(f.precio_total),
    asesor: aTexto(f.asesor),
    mostrado: aBool(f.mostrado),
  }));

  const insertados = await insertarEnLotes('boletas_historico', aInsertar);
  console.log(`✅ Perla Roja: ${insertados} boletas insertadas`);
}

// ─── PASO 3: Reconstruir snapshot de boletas de Apto Papá desde sus abonos ──
// Como no tenemos snapshot real, agrupamos los abonos por boleta y calculamos
// total_abonado para tener al menos los estados básicos.
async function reconstruirBoletasAptoPapa() {
  console.log('\n📂 Reconstruyendo snapshot de boletas de Apto Papá desde sus abonos...');
  const rifa = RIFAS.apto_papa;

  const { count: yaHay } = await supabase
    .from('boletas_historico')
    .select('*', { count: 'exact', head: true })
    .eq('rifa_id', rifa.id);

  if (yaHay && yaHay > 0) {
    console.log(`  Ya hay ${yaHay} filas, salto este paso.`);
    return;
  }

  // Agrupamos abonos por boleta usando una query SQL (más eficiente)
  const { data, error } = await supabase.rpc('reconstruir_boletas_historico_apto', {});
  if (error && !error.message.includes('does not exist')) {
    console.error('  Error:', error.message);
    return;
  }

  // Si la función RPC no existe, hacemos la agrupación a mano vía select
  const { data: abonosApto, error: e2 } = await supabase
    .from('abonos_historico')
    .select('numero_boleta, monto, asesor, fecha_pago')
    .eq('rifa_id', rifa.id)
    .limit(50000);
  if (e2) { console.error('  Error leyendo abonos:', e2.message); return; }

  // Agrupar en memoria
  const mapa = new Map();
  for (const a of abonosApto) {
    const k = a.numero_boleta;
    if (!mapa.has(k)) mapa.set(k, { numero: k, total: 0, asesor: a.asesor, ultimaFecha: a.fecha_pago });
    const x = mapa.get(k);
    x.total += Number(a.monto || 0);
    if (a.fecha_pago > x.ultimaFecha) { x.ultimaFecha = a.fecha_pago; x.asesor = a.asesor || x.asesor; }
  }

  const PRECIO = 80000;
  const aInsertar = [...mapa.values()].map(b => ({
    rifa_id: rifa.id,
    rifa_nombre: rifa.nombre,
    fecha_archivado: rifa.fecha_archivado,
    numero: b.numero,
    estado: b.total >= PRECIO ? 'Pagada' : (b.total > 0 ? 'Ocupada' : 'Reservado'),
    total_abonado: b.total,
    saldo_restante: Math.max(0, PRECIO - b.total),
    precio_total: PRECIO,
    asesor: b.asesor,
    fecha_venta: b.ultimaFecha,
  }));

  const insertados = await insertarEnLotes('boletas_historico', aInsertar);
  console.log(`✅ Apto Papá: ${insertados} boletas reconstruidas (basado en abonos)`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Migración de rifas históricas a Supabase\n');
  try {
    await importarAbonosAptoPapa();
    await importarBoletasPerlaRoja();
    await reconstruirBoletasAptoPapa();

    console.log('\n📊 Resumen final:');
    for (const k of Object.keys(RIFAS)) {
      const r = RIFAS[k];
      const { count: a } = await supabase.from('abonos_historico').select('*', { count: 'exact', head: true }).eq('rifa_id', r.id);
      const { count: b } = await supabase.from('boletas_historico').select('*', { count: 'exact', head: true }).eq('rifa_id', r.id);
      console.log(`  ${r.nombre}: ${a} abonos · ${b} boletas`);
    }
    console.log('\n✅ Migración completa');
  } catch (e) {
    console.error('\n❌ Falla:', e.message);
    process.exit(1);
  }
})();
