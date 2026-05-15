import fs from 'fs';
try {
  const envText = fs.readFileSync('.env.local', 'utf8');
  envText.split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  });
} catch {}
const TOKEN1 = process.env.CHATEA_TOKEN_LINEA_1;
const TOKEN2 = process.env.CHATEA_TOKEN_LINEA_2;
const BASE = 'https://chateapro.app/api';

async function get(url, token) {
  const r = await fetch(url, {headers: {Authorization: `Bearer ${token}`}});
  return r.json();
}

async function buscarEnLinea(nombre, token, lineaLabel) {
  console.log(`\n=== Buscando "Angela" en ${lineaLabel} ===`);
  const suscriptores = [];
  for (let p = 1; p <= 6; p++) {
    const r = await get(`${BASE}/subscribers?page=${p}&per_page=50`, token);
    if (!r.data?.length) break;
    suscriptores.push(...r.data);
    if (!r.links?.next) break;
  }
  console.log(`${lineaLabel}: ${suscriptores.length} suscriptores`);

  const posibles = suscriptores.filter(s => /angel/i.test((s.name||'') + ' ' + (s.first_name||'') + ' ' + (s.last_name||'')));
  console.log(`${lineaLabel}: ${posibles.length} con nombre Angel*`);
  posibles.forEach(s => console.log(`  ${s.user_ns} | ${s.name} | user_id:${s.user_id} | labels:${(s.labels||[]).map(l=>l.name).join(',')}`));

  // Revisar los últimos 30 suscriptores del día para ver bot messages con "Angela"
  console.log(`Buscando mensajes bot con 'Angela' en últimos suscriptores...`);
  let count = 0;
  for (const sub of suscriptores.slice(0, 30)) {
    try {
      const r = await get(`${BASE}/subscriber/chat-messages?user_ns=${sub.user_ns}&per_page=30`, token);
      const msgs = r.data || [];
      const match = msgs.find(m => m.type === 'out' && m.msg_type === 'text' && /ngela/i.test(m.payload?.text || m.content || ''));
      if (match) {
        count++;
        console.log(`  MATCH: ${sub.name} (${sub.user_ns}) — bot dijo: "${(match.payload?.text || match.content).substring(0, 150)}"`);
      }
    } catch {}
  }
  console.log(`${lineaLabel}: ${count} conversaciones con bot mencionando "Angela"`);
}

async function main() {
  await buscarEnLinea('Angela', TOKEN1, 'LÍNEA 1');
  await buscarEnLinea('Angela', TOKEN2, 'LÍNEA 2');
}
main().catch(e => console.error(e));
