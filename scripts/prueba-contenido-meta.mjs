/**
 * Script de prueba del Dashboard de Contenido.
 *
 * Lee el token CONTENIDO_META_TOKEN y los IDs de .env.local, y hace 4
 * llamadas a Meta para confirmar que el token funciona contra:
 *   1) El propio System User
 *   2) La cuenta publicitaria
 *   3) La Pagina de Facebook
 *   4) La cuenta de Instagram Business
 *
 * NO modifica nada del sistema existente. Solo lee datos.
 *
 * Ejecutar con:
 *   node scripts/prueba-contenido-meta.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Cargar variables de entorno desde .env.local
const envPath = path.join(projectRoot, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ No se encontró el archivo .env.local en', envPath);
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const TOKEN = process.env.CONTENIDO_META_TOKEN;
const AD_ACCOUNT_ID = process.env.CONTENIDO_AD_ACCOUNT_ID;
const PAGE_ID = process.env.CONTENIDO_PAGE_ID;
const IG_ID = process.env.CONTENIDO_IG_ACCOUNT_ID;

if (!TOKEN) {
  console.error('❌ Falta CONTENIDO_META_TOKEN en .env.local');
  process.exit(1);
}

const GRAPH = 'https://graph.facebook.com/v19.0';

async function meta(url, etiqueta) {
  process.stdout.write(`\n🔍 ${etiqueta}... `);
  try {
    const r = await fetch(url);
    const json = await r.json();
    if (json.error) {
      console.log(`\n   ❌ ${json.error.message} (code ${json.error.code})`);
      return null;
    }
    console.log('OK');
    return json;
  } catch (err) {
    console.log(`\n   ❌ Error de red: ${err.message}`);
    return null;
  }
}

function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('es-CO');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  PRUEBA — Dashboard de Contenido (conexión a Meta)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 1) Validar el token
const me = await meta(`${GRAPH}/me?access_token=${TOKEN}`, 'Token válido');
if (me) console.log(`   ✅ Identificado como: ${me.name} (id ${me.id})`);

// 2) Cuenta publicitaria
if (AD_ACCOUNT_ID) {
  const acct = await meta(
    `${GRAPH}/act_${AD_ACCOUNT_ID}?fields=name,currency,amount_spent,account_status&access_token=${TOKEN}`,
    `Cuenta publicitaria act_${AD_ACCOUNT_ID}`
  );
  if (acct) {
    const estado = acct.account_status === 1 ? 'Activa' : `estado ${acct.account_status}`;
    console.log(`   ✅ ${acct.name}`);
    console.log(`      Gasto total histórico: ${acct.currency} ${fmt(acct.amount_spent)}`);
    console.log(`      Estado: ${estado}`);
  }
} else {
  console.log('\n⚠️  Sin CONTENIDO_AD_ACCOUNT_ID, salto prueba de cuenta publicitaria');
}

// 3) Página de Facebook
if (PAGE_ID) {
  const page = await meta(
    `${GRAPH}/${PAGE_ID}?fields=name,followers_count,fan_count&access_token=${TOKEN}`,
    `Página de Facebook ${PAGE_ID}`
  );
  if (page) {
    console.log(`   ✅ ${page.name}`);
    console.log(`      Seguidores: ${fmt(page.followers_count)}  •  Fans: ${fmt(page.fan_count)}`);
  }
} else {
  console.log('\n⚠️  Sin CONTENIDO_PAGE_ID, salto prueba de Página');
}

// 4) Instagram Business
if (IG_ID) {
  const ig = await meta(
    `${GRAPH}/${IG_ID}?fields=username,followers_count,media_count,name&access_token=${TOKEN}`,
    `Instagram Business ${IG_ID}`
  );
  if (ig) {
    console.log(`   ✅ @${ig.username}${ig.name ? ` — ${ig.name}` : ''}`);
    console.log(`      Seguidores: ${fmt(ig.followers_count)}  •  Publicaciones: ${fmt(ig.media_count)}`);
  }
} else {
  console.log('\n⚠️  Sin CONTENIDO_IG_ACCOUNT_ID, salto prueba de Instagram');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Fin de la prueba');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
