#!/usr/bin/env node
// Extrae mensajes atípicos de clientes en Chatea Pro para detectar bugs en Camila
// Uso: node scripts/extraer-mensajes-raros.js

import fs from 'fs';
import path from 'path';

// Cargar .env.local manualmente
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  envText.split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  });
} catch {}

const TOKEN = process.env.CHATEA_TOKEN_LINEA_1;
const BASE = 'https://chateapro.app/api';
const MAX_SUSCRIPTORES = 150;
const MSGS_POR_SUSCRIPTOR = 40;

if (!TOKEN) {
  console.error('Falta CHATEA_TOKEN_LINEA_1 en .env.local');
  process.exit(1);
}

async function get(url) {
  const r = await fetch(url, {headers: {Authorization: `Bearer ${TOKEN}`}});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// Patrones comunes que NO queremos (mensajes triviales)
const PATRONES_TRIVIALES = [
  /^(hola|buenas|buen[oa]s (d[ií]as|tardes|noches)|hi|hey)\s*[!.?¿¡]*$/i,
  /^(si|s[ií]|no|ok|okay|vale|listo|dale|claro|perfecto|gracias|de nada|bueno)\s*[!.?¿¡]*$/i,
  /^\d{1,4}\s*$/,                                   // números solos (boletas)
  /^[\d\s.,$-]+\s*$/,                               // solo números y símbolos
  /^[a-z\s]{1,4}$/i,                                // muy cortas
  /^(cuánto|cuanto) (cuesta|vale|es)\??$/i,         // pregunta de precio básica
  /^(qué|que) (premio|premios)\??$/i,               // pregunta de premio básica
  /^(cuál|cual) es el (nequi|daviplata|bancolombia|número|numero)\??$/i,
  /^(me mandas|mándame|mandame) (los números|los numeros)\??$/i,
  /^(listo|ya|ok)\s*[!.?¿¡]*$/i,
];

// Plantillas automáticas (formularios, copia-pega de reservas)
const PLANTILLAS_AUTOMATICAS = [
  /acabo de reservar mis boletas/i,
  /hola los plata!/i,
  /\*nombre:\*/i,
  /\*celular:\*/i,
  /\*numeros:\*/i,
  /me podrian enviar el link/i,
];

function esPlantilla(texto) {
  // Si coincide con 2+ patrones de plantilla, es copia-pega automática
  const matches = PLANTILLAS_AUTOMATICAS.filter(p => p.test(texto)).length;
  return matches >= 2;
}

// Palabras comunes que SUGIEREN un caso interesante
const INDICADORES_INTERESANTES = [
  /cancel/i, /devol/i, /reembolso/i, /gan[óo]/i, /ganador/i,
  /rifa anterior/i, /rifa pasada/i, /la otra/i, /fraude/i, /estaf/i,
  /denunc/i, /demanda/i, /reclam/i, /queja/i, /molest/i, /enoj/i,
  /compraron/i, /vendieron/i, /vendido/i, /repetido/i, /duplicad/i,
  /error/i, /fall[óo]/i, /problema/i, /no me lleg/i, /no recib/i,
  /roja|azul|verde|amarill|negr|blanc/i,  // colores específicos (casos edge)
  /cédul|documento|carnet/i,
  /mayor de edad|menor de edad/i,
  /ext(ra|erior|ranj)/i,
  /vendedor|comisión|comision|revended/i,
  /por qué|porqu[eé]/i,
  /cómo sé|como se/i,
  /no entiendo/i,
  /efectivo|consign(ar|aci)/i,
  /cuota|abono parcial/i,
  /premio adicional|premio mayor|premio extra/i,
  /\?\s*\?/,  // doble interrogación
  /!{2,}/,    // signos de exclamación múltiples
];

function esTrivial(texto) {
  return PATRONES_TRIVIALES.some(p => p.test(texto.trim()));
}

function puntuarInteres(texto) {
  let score = 0;
  // Longitud moderada es mejor (ni muy corto ni plantilla larga)
  const len = texto.length;
  if (len >= 15 && len <= 200) score += 3;
  else if (len > 200) score += 0.5; // plantillas largas puntúan poco
  // Patrones interesantes (palabras clave de casos raros)
  INDICADORES_INTERESANTES.forEach(p => { if (p.test(texto)) score += 4; });
  // Signos de pregunta (mensajes con dudas son buenos para testear)
  if (/\?/.test(texto)) score += 2;
  // Penalizar si tiene estructura de plantilla (saltos de línea + asteriscos)
  const saltos = (texto.match(/\n/g) || []).length;
  const asteriscos = (texto.match(/\*/g) || []).length;
  if (saltos > 3 && asteriscos > 3) score -= 5;
  return score;
}

// Huella para deduplicar mensajes muy similares (no solo idénticos)
function huella(texto) {
  return texto
    .toLowerCase()
    .replace(/\d+/g, 'N')                    // todos los números → N
    .replace(/[áéíóúñü]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n',ü:'u'}[c]))
    .replace(/[^\w\s]/g, '')                 // quitar puntuación
    .split(/\s+/).filter(w => w.length > 3)  // quedarse con palabras significativas
    .slice(0, 8)                              // primeras 8 palabras clave
    .sort()
    .join(' ');
}

async function main() {
  console.log('Listando suscriptores...');
  const suscriptores = [];
  let page = 1;
  while (suscriptores.length < MAX_SUSCRIPTORES) {
    const r = await get(`${BASE}/subscribers?page=${page}&per_page=50`);
    if (!r.data?.length) break;
    suscriptores.push(...r.data);
    if (!r.links?.next) break;
    page++;
  }
  console.log(`Encontrados ${suscriptores.length} suscriptores`);

  console.log('Extrayendo mensajes...');
  const candidatos = [];
  let procesados = 0;
  for (const sub of suscriptores.slice(0, MAX_SUSCRIPTORES)) {
    try {
      const r = await get(`${BASE}/subscriber/chat-messages?user_ns=${sub.user_ns}&per_page=${MSGS_POR_SUSCRIPTOR}`);
      const msgs = r.data || [];
      for (const m of msgs) {
        if (m.type !== 'in') continue;           // solo mensajes entrantes
        if (m.msg_type !== 'text') continue;     // solo texto
        const texto = (m.payload?.text || m.content || '').trim();
        if (!texto || texto.length < 6) continue;
        if (esTrivial(texto)) continue;
        if (esPlantilla(texto)) continue;       // descartar copia-pega de reservas
        const score = puntuarInteres(texto);
        if (score < 4) continue;
        candidatos.push({
          texto,
          score: +score.toFixed(1),
          cliente: sub.name || sub.first_name || sub.user_id,
          fecha: new Date(m.ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
          labels: (sub.labels || []).map(l => l.name).join(', '),
          user_ns: sub.user_ns
        });
      }
      procesados++;
      if (procesados % 20 === 0) console.log(`  procesados ${procesados}/${suscriptores.length}`);
    } catch (e) {
      // Ignorar suscriptores que fallan
    }
  }

  // Deduplicar por huella (mensajes estructuralmente similares)
  const porHuella = new Map();
  for (const c of candidatos) {
    const h = huella(c.texto);
    const existe = porHuella.get(h);
    if (!existe || c.score > existe.score) porHuella.set(h, c);
  }
  const unicos = [...porHuella.values()].sort((a, b) => b.score - a.score);
  console.log(`\n${unicos.length} mensajes únicos candidatos después de filtros`);

  // Guardar TOP 60 (le mostramos a Mateo 20 y dejamos reserva)
  const top = unicos.slice(0, 60);
  const outDir = path.join(process.cwd(), 'docs', 'sync');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, `mensajes-raros-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outFile, JSON.stringify(top, null, 2));
  console.log(`\nGuardado: ${outFile}`);

  // Mostrar top 20 en consola
  console.log('\n=== TOP 20 MENSAJES RAROS ===\n');
  top.slice(0, 20).forEach((c, i) => {
    console.log(`${i + 1}. [${c.score}] ${c.cliente} — ${c.fecha}`);
    console.log(`   "${c.texto}"`);
    if (c.labels) console.log(`   Labels: ${c.labels}`);
    console.log();
  });
}

main().catch(e => { console.error(e); process.exit(1); });
