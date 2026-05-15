import fs from 'fs';
try {
  const envText = fs.readFileSync('.env.local', 'utf8');
  envText.split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  });
} catch {}
const TOKEN = process.env.CHATEA_TOKEN_LINEA_2;
const BASE = 'https://chateapro.app/api';
const TAG = 'f166221t2556385';

async function get(url) {
  const r = await fetch(url, {headers: {Authorization: `Bearer ${TOKEN}`}});
  return r.json();
}

async function main() {
  const suscriptores = [];
  for (let p = 1; p <= 5; p++) {
    const r = await get(`${BASE}/subscribers?tag_ns=${TAG}&page=${p}&per_page=25`);
    if (!r.data?.length) break;
    suscriptores.push(...r.data.filter(s => (s.tags||[]).some(t => t.tag_ns === TAG)));
    if (!r.links?.next) break;
  }

  for (const sub of suscriptores) {
    const r = await get(`${BASE}/subscriber/chat-messages?user_ns=${sub.user_ns}&per_page=50`);
    const msgs = r.data || [];
    const bot = msgs.filter(m => m.type === 'out' && m.msg_type === 'text');
    const hasAngela = bot.some(m => /ngela|ngel[ai]/i.test(m.payload?.text || m.content || ''));
    if (bot.length > 0) {
      console.log('---');
      console.log(`Cliente: ${sub.name || sub.user_id} | user_ns: ${sub.user_ns}`);
      console.log(`Labels: ${(sub.labels||[]).map(l=>l.name).join(',') || '(sin)'}`);
      console.log(`Bot msgs: ${bot.length}`);
      if (hasAngela) console.log('** DICE ANGELA/ÁNGELA **');
      bot.slice(0, 2).forEach(m => console.log(`  Bot: "${(m.payload?.text || m.content).substring(0, 200)}"`));
    }
  }
}
main().catch(e => console.error(e));
