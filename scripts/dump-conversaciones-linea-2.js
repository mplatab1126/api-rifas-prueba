#!/usr/bin/env node
// Vuelca conversaciones de Línea 2 con tag Agente a markdown legible

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

async function get(url) {
  const r = await fetch(url, {headers: {Authorization: `Bearer ${TOKEN}`}});
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function contenidoMsg(m) {
  if (m.msg_type === 'text') return m.payload?.text || m.content || '';
  if (m.msg_type === 'image') return `[IMAGEN] ${m.payload?.title || m.payload?.caption || m.payload?.url?.split('/').pop() || ''}`;
  if (m.msg_type === 'audio') return `[AUDIO] ${m.payload?.url?.split('/').pop() || ''}`;
  if (m.msg_type === 'file') return `[ARCHIVO] ${m.payload?.url?.split('/').pop() || ''}`;
  if (m.msg_type === 'video') return `[VIDEO]`;
  return `[${m.msg_type?.toUpperCase()}]`;
}

async function main() {
  console.log('Listando suscriptores con tag Agente en Línea 2...');
  const suscriptores = [];
  let page = 1;
  while (true) {
    const r = await get(`${BASE}/subscribers?tag_ns=${AGENTE_TAG_NS}&page=${page}&per_page=25`);
    if (!r.data?.length) break;
    const conAgente = r.data.filter(s => (s.tags || []).some(t => t.tag_ns === AGENTE_TAG_NS));
    suscriptores.push(...conAgente);
    if (!r.links?.next) break;
    page++;
  }
  console.log(`Total con tag Agente: ${suscriptores.length}\n`);

  let md = `# Conversaciones Línea 2 — Tag "Agente"\n\n`;
  md += `**Fecha del dump:** ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`;
  md += `**Total de conversaciones:** ${suscriptores.length}\n\n---\n\n`;

  for (const sub of suscriptores) {
    try {
      const r = await get(`${BASE}/subscriber/chat-messages?user_ns=${sub.user_ns}&per_page=60`);
      const msgs = (r.data || []).reverse(); // cronológico
      if (!msgs.length) continue;

      const labels = (sub.labels || []).map(l => l.name).join(', ') || '(sin label)';
      md += `## ${sub.name || sub.user_id}\n\n`;
      md += `- **Teléfono:** ${sub.user_id}\n`;
      md += `- **Labels:** ${labels}\n`;
      md += `- **Último mensaje:** ${sub.last_message_at || 'N/A'}\n`;
      md += `- **user_ns:** \`${sub.user_ns}\`\n\n`;
      md += `### Conversación (últimos ${msgs.length} mensajes, cronológico)\n\n`;

      for (const m of msgs) {
        const fecha = new Date(m.ts * 1000).toISOString().slice(5, 16).replace('T', ' ');
        const contenido = contenidoMsg(m);
        if (!contenido) continue;
        const emisor = m.type === 'in' ? '👤 Cliente' : '🤖 Bot/Camila';
        // Marcar "AI Function call" distinto
        if (contenido.startsWith('AI Function call:')) {
          md += `- \`${fecha}\` ⚙️ ${contenido}\n`;
        } else {
          const textoMostrar = contenido.length > 500 ? contenido.substring(0, 500) + '...' : contenido;
          md += `- \`${fecha}\` **${emisor}:** ${textoMostrar.replace(/\n/g, '\n    ')}\n`;
        }
      }
      md += `\n---\n\n`;
    } catch (e) {
      console.log(`Error en ${sub.name}: ${e.message}`);
    }
  }

  const outDir = path.join(process.cwd(), 'docs', 'sync');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, `conversaciones-linea-2-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(outFile, md);
  console.log(`\nGuardado: ${outFile}`);
  console.log(`Tamaño: ${(md.length / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
