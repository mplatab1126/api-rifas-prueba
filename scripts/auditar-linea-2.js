#!/usr/bin/env node
// Audita conversaciones de la Línea 2 con tag "Agente" buscando errores de Camila:
// - Mensajes duplicados (bot envía 2 cosas casi idénticas seguidas)
// - Fallas de flujo (cliente dice X y bot responde algo incoherente)
// - Escaladas innecesarias (cliente solo saluda y bot lo pasa a asesor)

import fs from 'fs';
import path from 'path';

try {
  const envText = fs.readFileSync('.env.local', 'utf8');
  envText.split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  });
} catch {}

const TOKEN = process.env.CHATEA_TOKEN_LINEA_2;
const BASE = 'https://chateapro.app/api';
const AGENTE_TAG_NS = 'f166221t2556385';
const MAX_SUSCRIPTORES = 50;

if (!TOKEN) { console.error('Falta CHATEA_TOKEN_LINEA_2'); process.exit(1); }

async function get(url) {
  const r = await fetch(url, {headers: {Authorization: `Bearer ${TOKEN}`}});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function extraerTexto(m) {
  return (m.payload?.text || m.content || '').trim();
}

function similitud(a, b) {
  const na = a.toLowerCase().replace(/[^\w\s]/g, '');
  const nb = b.toLowerCase().replace(/[^\w\s]/g, '');
  if (na === nb) return 1;
  if (na.length < 10 || nb.length < 10) return na === nb ? 1 : 0;
  const palA = new Set(na.split(/\s+/));
  const palB = new Set(nb.split(/\s+/));
  const inter = [...palA].filter(p => palB.has(p)).length;
  const union = new Set([...palA, ...palB]).size;
  return inter / union;
}

async function main() {
  console.log('Listando suscriptores con tag Agente...');
  const suscriptores = [];
  let page = 1;
  while (suscriptores.length < MAX_SUSCRIPTORES) {
    const r = await get(`${BASE}/subscribers?tag_ns=${AGENTE_TAG_NS}&page=${page}&per_page=25`);
    if (!r.data?.length) break;
    const conAgente = r.data.filter(s => (s.tags || []).some(t => t.tag_ns === AGENTE_TAG_NS));
    suscriptores.push(...conAgente);
    if (!r.links?.next) break;
    page++;
  }
  console.log(`Suscriptores con tag Agente: ${suscriptores.length}\n`);

  const errores = [];
  let procesados = 0;

  for (const sub of suscriptores.slice(0, MAX_SUSCRIPTORES)) {
    try {
      const r = await get(`${BASE}/subscriber/chat-messages?user_ns=${sub.user_ns}&per_page=80`);
      const msgs = (r.data || []).reverse(); // orden cronológico

      // Detectar errores
      for (let i = 0; i < msgs.length - 1; i++) {
        const m1 = msgs[i];
        const m2 = msgs[i + 1];

        // 1. Mensajes duplicados del bot
        if (m1.type === 'out' && m2.type === 'out' && m1.msg_type === 'text' && m2.msg_type === 'text') {
          const t1 = extraerTexto(m1);
          const t2 = extraerTexto(m2);
          const dt = m2.ts - m1.ts;
          const sim = similitud(t1, t2);
          if (sim > 0.5 && dt < 300 && t1.length > 15 && t2.length > 15) {
            errores.push({
              tipo: 'DUPLICADO',
              cliente: sub.name || sub.user_id,
              user_ns: sub.user_ns,
              fecha: new Date(m1.ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
              similitud: sim.toFixed(2),
              msg1: t1.substring(0, 200),
              msg2: t2.substring(0, 200)
            });
          }
        }

        // 2. Bot manda audio/imagen fuera de contexto (no esperado desde Camila v2)
        if (m1.type === 'out' && (m1.msg_type === 'audio' || m1.msg_type === 'image')) {
          // los flujos sí mandan audios/fotos en Contacto Inicial — no alertamos
        }
      }

      // 3. Detectar escaladas innecesarias: si el último mensaje del cliente fue corto
      //    y no parece problemático, pero luego hay mensaje del bot tipo "te paso con asesor"
      for (let i = 1; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.type !== 'out') continue;
        const t = extraerTexto(m).toLowerCase();
        if (!/asesor|compañer/.test(t)) continue;
        const prev = msgs[i - 1];
        if (prev?.type !== 'in') continue;
        const pt = extraerTexto(prev);
        if (pt.length < 30 && /^(hola|si|ok|dale|gracias|listo|buenas|cancel)/i.test(pt)) {
          errores.push({
            tipo: 'ESCALADA_DUDOSA',
            cliente: sub.name || sub.user_id,
            user_ns: sub.user_ns,
            fecha: new Date(m.ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
            clienteDijo: pt,
            botEscalo: extraerTexto(m).substring(0, 200)
          });
        }
      }

      // 4. Detectar función IA llamada erróneamente: content "AI Function call: X"
      //    seguida de respuesta que contradice la función
      for (let i = 0; i < msgs.length - 1; i++) {
        const m = msgs[i];
        const c = extraerTexto(m);
        if (!c.startsWith('AI Function call:')) continue;
        const funcion = c.replace('AI Function call:', '').trim();
        // Si llamó verificar_pago pero el cliente NO había mandado comprobante ni dicho "pagué"
        if (funcion === 'verificar_pago') {
          // mirar los 3 mensajes anteriores del cliente
          const prevMsgs = msgs.slice(Math.max(0, i - 6), i).filter(x => x.type === 'in');
          const textoPrev = prevMsgs.map(extraerTexto).join(' | ').toLowerCase();
          const esComprobante = prevMsgs.some(x => x.msg_type === 'image' || x.msg_type === 'file');
          const menciona = /pag[ouéa]|consign|transfer|listo|comprobante|recib[oí]/i.test(textoPrev);
          if (!esComprobante && !menciona) {
            errores.push({
              tipo: 'VERIFICAR_PAGO_MAL_DISPARADA',
              cliente: sub.name || sub.user_id,
              user_ns: sub.user_ns,
              fecha: new Date(m.ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
              contextoPrevio: textoPrev.substring(0, 300) || '(ningun mensaje relevante)'
            });
          }
        }
      }

      procesados++;
      if (procesados % 10 === 0) console.log(`  procesados ${procesados}/${suscriptores.length}`);
    } catch (e) {
      // ignorar
    }
  }

  // Agrupar por tipo
  const porTipo = {};
  for (const e of errores) {
    porTipo[e.tipo] = porTipo[e.tipo] || [];
    porTipo[e.tipo].push(e);
  }

  // Guardar detalle
  const outDir = path.join(process.cwd(), 'docs', 'sync');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, `auditoria-linea-2-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outFile, JSON.stringify({total: errores.length, porTipo, errores}, null, 2));

  console.log(`\n=== RESUMEN ===`);
  console.log(`Total de errores detectados: ${errores.length}`);
  for (const tipo of Object.keys(porTipo)) {
    console.log(`  ${tipo}: ${porTipo[tipo].length}`);
  }
  console.log(`\nDetalle guardado en: ${outFile}\n`);

  // Mostrar top 5 de cada tipo
  for (const tipo of Object.keys(porTipo)) {
    console.log(`\n========== ${tipo} (${porTipo[tipo].length}) ==========\n`);
    porTipo[tipo].slice(0, 5).forEach((e, i) => {
      console.log(`--- #${i + 1} ---`);
      console.log(`Cliente: ${e.cliente} | Fecha: ${e.fecha}`);
      if (e.msg1) console.log(`Bot msg 1: "${e.msg1}"`);
      if (e.msg2) console.log(`Bot msg 2: "${e.msg2}"`);
      if (e.clienteDijo) console.log(`Cliente dijo: "${e.clienteDijo}"`);
      if (e.botEscalo) console.log(`Bot escaló: "${e.botEscalo}"`);
      if (e.contextoPrevio) console.log(`Contexto previo: "${e.contextoPrevio}"`);
      console.log();
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
