/**
 * Servidor local del Dashboard de Contenido.
 *
 * Sirve:
 *   - /                              → redirige al dashboard
 *   - /rendimiento-contenido/*       → archivos estaticos del dashboard
 *   - /api/contenido/datos           → data real de Meta (ads + organico + copys)
 *   - /api/contenido/test            → prueba rapida de conexion
 *
 * Uso:
 *   node scripts/dev-contenido-server.mjs
 *
 * Despues abrir en navegador:
 *   http://localhost:3100/rendimiento-contenido/
 *
 * NO modifica nada del sistema existente. Solo lee de Meta.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public', 'rendimiento-contenido');

// ─── 1. Cargar .env.local ──────────────────────────────────────────────────
const envPath = path.join(projectRoot, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ No se encontro .env.local en', envPath);
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
const GRAPH = 'https://graph.facebook.com/v19.0';

if (!TOKEN) {
  console.error('❌ Falta CONTENIDO_META_TOKEN en .env.local');
  process.exit(1);
}

// ─── 2. Helpers ────────────────────────────────────────────────────────────

// Cache del Page Access Token (necesario para consultar posts de la Pagina)
let pageTokenCache = null;
async function getPageAccessToken() {
  if (pageTokenCache) return pageTokenCache;
  if (!PAGE_ID) return null;
  try {
    // Metodo directo: preguntar al nodo de la pagina por su access_token.
    // Evita el rate limit de /me/accounts y es mas robusto.
    const r = await fetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${TOKEN}`);
    const j = await r.json();
    if (j && j.access_token) {
      pageTokenCache = j.access_token;
      return pageTokenCache;
    }
  } catch (_err) {
    // ignorar
  }
  return null;
}

async function metaFetch(url) {
  try {
    const r = await fetch(url);
    const json = await r.json();
    if (json.error) {
      console.warn(`   ⚠️  Meta error: ${json.error.message} (code ${json.error.code})`);
      return { data: [], error: json.error };
    }
    return json;
  } catch (err) {
    console.warn(`   ⚠️  Red: ${err.message}`);
    return { data: [], error: { message: err.message } };
  }
}

function isoDateMinus(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function diffDaysInclusive(a, b) {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  return Math.max(1, Math.round((db - da) / 86400000) + 1);
}

function defaultRange() {
  const until = new Date().toISOString().slice(0, 10);
  const since = isoDateMinus(until, 22);
  return { since, until };
}

// ─── 3. Transformadores Meta → forma que espera el dashboard ──────────────

function transformarAd(item) {
  // Compras: omni_purchase agrega pixel + CAPI + app + offline. Fallback: variantes onsite.
  const PURCHASE_TYPES = [
    'omni_purchase',
    'onsite_conversion.purchase',
    'onsite_web_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'purchase',
  ];
  let purchases = 0;
  let revenue = 0;
  for (const t of PURCHASE_TYPES) {
    const p = (item.actions || []).find((a) => a.action_type === t);
    if (p) {
      purchases = parseInt(p.value) || 0;
      break;
    }
  }
  for (const t of PURCHASE_TYPES) {
    const v = (item.action_values || []).find((a) => a.action_type === t);
    if (v) {
      revenue = parseFloat(v.value) || 0;
      break;
    }
  }
  // Conversaciones iniciadas (complemento para anuncios de WhatsApp)
  let conversations = 0;
  const c = (item.actions || []).find(
    (a) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
  );
  if (c) conversations = parseInt(c.value) || 0;
  // Hook rate: 3-sec video views. En v19 se derivan de actions[video_view]
  let videoViews3s = 0;
  if (item.actions) {
    const vv = item.actions.find((a) => a.action_type === 'video_view');
    if (vv) videoViews3s = parseInt(vv.value) || 0;
  }
  // Hold rate: avg watch time (en segundos) dividido por duracion del video
  let avgWatchTimeSec = 0;
  if (item.video_avg_time_watched_actions && item.video_avg_time_watched_actions.length) {
    const v = item.video_avg_time_watched_actions.find((a) => a.action_type === 'video_view');
    if (v) avgWatchTimeSec = parseFloat(v.value) || 0;
  }

  return {
    id: item.ad_id || item.id,
    name: item.ad_name || 'Sin nombre',
    date: item.date_start || new Date().toISOString().slice(0, 10),
    campaign: item.campaign_name || 'Sin campaña',
    spend: Math.round(parseFloat(item.spend) || 0),
    purchases,
    conversations,
    revenue: Math.round(revenue),
    impressions: parseInt(item.impressions) || 0,
    clicks: parseInt(item.inline_link_clicks) || parseInt(item.clicks) || 0,
    videoViews3s,
    avgWatchTimeSec,
    contentType: null,
    hookType: null,
    format: null, // se rellena si tenemos creative
    videoDurationSec: 0, // Meta no siempre lo da en insights; puede venir en creative
    copyText: '',
    performanceDeltaPct: 0,
    activeDays: 0,
    transcription: '',
  };
}

function agruparAds(insights) {
  // Meta devuelve una fila por ad × dia. Agrupamos por ad sumando metricas.
  const map = new Map();
  for (const row of insights) {
    const key = row.ad_id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ad_id: row.ad_id,
        ad_name: row.ad_name,
        campaign_name: row.campaign_name,
        date_start: row.date_start,
        date_stop: row.date_stop,
        spend: parseFloat(row.spend) || 0,
        impressions: parseInt(row.impressions) || 0,
        clicks: parseInt(row.inline_link_clicks) || parseInt(row.clicks) || 0,
        reach: parseInt(row.reach) || 0,
        actions: [...(row.actions || [])],
        action_values: [...(row.action_values || [])],
        video_avg_time_watched_actions: [...(row.video_avg_time_watched_actions || [])],
        _avgCount: 1,
        _durationWatchedTotal: parseFloat(
          (row.video_avg_time_watched_actions || []).find((a) => a.action_type === 'video_view')?.value || 0
        ),
      });
    } else {
      existing.spend += parseFloat(row.spend) || 0;
      existing.impressions += parseInt(row.impressions) || 0;
      existing.clicks += parseInt(row.inline_link_clicks) || parseInt(row.clicks) || 0;
      existing.reach += parseInt(row.reach) || 0;
      // fecha mas reciente
      if (row.date_start > existing.date_start) existing.date_start = row.date_start;
      // sumar actions/action_values con mismo action_type
      for (const a of row.actions || []) {
        const e = existing.actions.find((x) => x.action_type === a.action_type);
        if (e) e.value = String((parseFloat(e.value) || 0) + (parseFloat(a.value) || 0));
        else existing.actions.push({ ...a });
      }
      for (const a of row.action_values || []) {
        const e = existing.action_values.find((x) => x.action_type === a.action_type);
        if (e) e.value = String((parseFloat(e.value) || 0) + (parseFloat(a.value) || 0));
        else existing.action_values.push({ ...a });
      }
      // avg_time: promediar
      const v = (row.video_avg_time_watched_actions || []).find((a) => a.action_type === 'video_view');
      if (v) {
        existing._durationWatchedTotal += parseFloat(v.value) || 0;
        existing._avgCount += 1;
      }
    }
  }
  // Recalcular avg_time como promedio
  for (const ad of map.values()) {
    const promedio = ad._durationWatchedTotal / (ad._avgCount || 1);
    ad.video_avg_time_watched_actions = [{ action_type: 'video_view', value: String(promedio) }];
  }
  return [...map.values()];
}

async function enrichCreativos(ads) {
  // Para cada ad, pedir creative (body + thumbnail + video_id + object_type)
  const promises = ads.map(async (ad) => {
    const r = await metaFetch(
      `${GRAPH}/${ad.id}?fields=creative{body,object_type,video_id,thumbnail_url,image_url,effective_object_story_id}&access_token=${TOKEN}`
    );
    if (r && r.creative) {
      ad.copyText = r.creative.body || '';
      ad.thumbnail = r.creative.thumbnail_url || r.creative.image_url || null;
      const ot = (r.creative.object_type || '').toUpperCase();
      if (ot.includes('VIDEO')) ad.format = 'Video';
      else if (ot.includes('CAROUSEL')) ad.format = 'Carrusel';
      else if (ot.includes('PHOTO') || ot.includes('IMAGE')) ad.format = 'Imagen';
      // Si tiene video_id, pedir su duracion y thumbnail si no lo tenemos
      if (r.creative.video_id) {
        const vr = await metaFetch(
          `${GRAPH}/${r.creative.video_id}?fields=length,picture&access_token=${TOKEN}`
        );
        if (vr && vr.length) ad.videoDurationSec = Math.round(parseFloat(vr.length));
        if (vr && vr.picture && !ad.thumbnail) ad.thumbnail = vr.picture;
      }
    }
    return ad;
  });
  return Promise.all(promises);
}

async function traerAds(since, until) {
  if (!AD_ACCOUNT_ID) return { ads: [], campaigns: [] };
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = [
    'ad_id',
    'ad_name',
    'campaign_name',
    'spend',
    'impressions',
    'inline_link_clicks',
    'clicks',
    'reach',
    'actions',
    'action_values',
    'video_avg_time_watched_actions',
  ].join(',');

  let url = `${GRAPH}/act_${AD_ACCOUNT_ID}/insights?level=ad&fields=${fields}&time_range=${timeRange}&time_increment=1&limit=500&access_token=${TOKEN}`;

  const allRows = [];
  while (url) {
    const r = await metaFetch(url);
    if (r.data) allRows.push(...r.data);
    url = r.paging?.next || null;
  }

  const grouped = agruparAds(allRows);
  let ads = grouped.map(transformarAd);
  ads = await enrichCreativos(ads);

  const campaigns = [...new Set(ads.map((a) => a.campaign).filter(Boolean))];
  return { ads, campaigns };
}

async function traerInstagram(since, until) {
  if (!IG_ID) return [];
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  // Metricas de video:
  //   reach             = cuentas unicas que vieron el contenido
  //   views             = reproducciones solo en Instagram
  //   crossposted_views = reproducciones agregadas IG + Facebook (cuando el
  //                       Reel se cross-postea). Este es el numero grande
  //                       que Instagram muestra como "Reproducciones".
  // Para videos preferimos crossposted_views; caemos a views; ultimo a reach.
  // Para posts de imagen/carrusel, usamos reach.
  const url = `${GRAPH}/${IG_ID}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,insights.metric(reach,views,crossposted_views,saved,comments,likes,shares,total_interactions)&since=${sinceTs}&until=${untilTs}&limit=50&access_token=${TOKEN}`;
  const r = await metaFetch(url);
  if (!r.data) return [];
  return r.data.map((m) => {
    const ins = (m.insights && m.insights.data) || [];
    const metric = (key) => {
      const item = ins.find((x) => x.name === key);
      return item && item.values && item.values[0] ? parseInt(item.values[0].value) || 0 : 0;
    };
    const reach = metric('reach');
    const views = metric('views');
    const crossposted = metric('crossposted_views');
    const plays = crossposted || views; // total plays incluyendo FB cross-post
    const likes = metric('likes');
    const comments = metric('comments');
    const shares = metric('shares');
    const saves = metric('saved');
    const totalInt = metric('total_interactions') || likes + comments + shares + saves;
    const type = (m.media_type || '').toLowerCase();
    const esVideo = type === 'video' || type === 'reels' || m.media_product_type === 'REELS';
    // Para videos usamos plays como valor visible (lo que muestra Instagram).
    // Si viene 0, caemos al reach unico.
    const displayReach = esVideo && plays > 0 ? plays : reach;
    // Para videos, thumbnail_url; para imagenes, media_url.
    const thumbnail = esVideo ? m.thumbnail_url || m.media_url : m.media_url;
    return {
      id: m.id,
      social: 'instagram',
      type: esVideo ? 'video' : 'post',
      title: (m.caption || '').split('\n')[0].slice(0, 120) || 'Sin titulo',
      date: (m.timestamp || '').slice(0, 10),
      campaign: '',
      reach: displayReach,
      reachUnique: reach,
      plays,
      interactions: totalInt,
      saves,
      shares,
      followersGained: 0,
      contentType: null,
      hookType: null,
      format: esVideo ? 'Reel' : 'Post',
      videoDurationSec: 0,
      copyText: m.caption || '',
      performanceDeltaPct: 0,
      activeDays: 0,
      transcription: '',
      permalink: m.permalink || null,
      thumbnail: thumbnail || null,
    };
  });
}

async function traerPagePosts(since, until) {
  if (!PAGE_ID) return [];
  const pageToken = await getPageAccessToken();
  if (!pageToken) {
    console.warn('   ⚠️  No se pudo obtener Page Access Token');
    return [];
  }
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  // Query simple SIN insights: los metric nombres varian entre versiones y
  // fallan toda la query. Los posts sin insights igual son utiles para ver
  // cuando publicamos y el copy. Reach/interacciones se agregan despues.
  const url = `${GRAPH}/${PAGE_ID}/posts?fields=id,message,created_time,permalink_url,full_picture,attachments{media_type,type,media{image{src}}},shares&since=${sinceTs}&until=${untilTs}&limit=50&access_token=${pageToken}`;
  const r = await metaFetch(url);
  if (!r.data) return [];
  // Traer insights por post en paralelo (alcance unico). Si falla, dejamos 0.
  const reaches = await Promise.all(
    r.data.map(async (p) => {
      const ri = await metaFetch(
        `${GRAPH}/${p.id}/insights?metric=post_impressions_unique&access_token=${pageToken}`
      );
      return parseInt(ri.data?.[0]?.values?.[0]?.value) || 0;
    })
  );
  return r.data.map((p, i) => {
    const shares = (p.shares && p.shares.count) || 0;
    const interactions = shares; // reacciones/comentarios requieren permisos extras. Se puede mejorar despues.
    const attach = p.attachments?.data?.[0];
    const tipoAttach = (attach?.media_type || attach?.type || '').toLowerCase();
    const esVideo = tipoAttach.includes('video');
    const thumbnail = attach?.media?.image?.src || p.full_picture || null;
    const reach = reaches[i] || 0;
    return {
      id: p.id,
      social: 'facebook',
      type: esVideo ? 'video' : 'post',
      title: (p.message || '').split('\n')[0].slice(0, 120) || 'Sin titulo',
      date: (p.created_time || '').slice(0, 10),
      campaign: '',
      reach,
      interactions,
      saves: 0,
      shares,
      followersGained: 0,
      contentType: null,
      hookType: null,
      format: esVideo ? 'Video' : 'Post',
      videoDurationSec: 0,
      copyText: p.message || '',
      performanceDeltaPct: 0,
      activeDays: 0,
      transcription: '',
      permalink: p.permalink_url || null,
      thumbnail,
    };
  });
}

async function traerFollowersInstagram(since, until) {
  if (!IG_ID) return { gained: 0, daily: [] };
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  const url = `${GRAPH}/${IG_ID}/insights?metric=follower_count&period=day&since=${sinceTs}&until=${untilTs}&access_token=${TOKEN}`;
  const r = await metaFetch(url);
  const values = r.data?.[0]?.values || [];
  const daily = values.map((v) => ({
    date: (v.end_time || '').slice(0, 10),
    count: parseInt(v.value) || 0,
  }));
  const gained = daily.reduce((acc, d) => acc + d.count, 0);
  return { gained, daily };
}

async function traerPageReach(since, until) {
  if (!PAGE_ID) return 0;
  const pageToken = await getPageAccessToken();
  if (!pageToken) return 0;
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  const intentos = ['page_impressions_unique', 'page_impressions'];
  for (const metric of intentos) {
    const url = `${GRAPH}/${PAGE_ID}/insights?metric=${metric}&period=day&since=${sinceTs}&until=${untilTs}&access_token=${pageToken}`;
    const r = await metaFetch(url);
    const values = r.data?.[0]?.values;
    if (values && values.length) {
      return values.reduce((acc, v) => acc + (parseInt(v.value) || 0), 0);
    }
  }
  return 0;
}

async function traerFollowersPage(since, until) {
  if (!PAGE_ID) return { gained: 0, daily: [] };
  const pageToken = await getPageAccessToken();
  if (!pageToken) return { gained: 0, daily: [] };
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  // page_follows devuelve el total acumulado cada dia. El crecimiento del
  // periodo es el ultimo menos el primero. Fallback a otros nombres si algun
  // dia Meta lo deprecia.
  const intentos = ['page_follows', 'page_fans'];
  for (const metric of intentos) {
    const url = `${GRAPH}/${PAGE_ID}/insights?metric=${metric}&period=day&since=${sinceTs}&until=${untilTs}&access_token=${pageToken}`;
    const r = await metaFetch(url);
    const values = r.data?.[0]?.values;
    if (values && values.length) {
      const daily = values.map((v) => ({
        date: (v.end_time || '').slice(0, 10),
        count: parseInt(v.value) || 0,
      }));
      const gained = daily.length > 1 ? daily[daily.length - 1].count - daily[0].count : 0;
      return { gained, daily, metric };
    }
  }
  return { gained: 0, daily: [] };
}

function derivarCopies(ads, organic) {
  const copies = [];
  // Top 2 ads por ROAS (requiere spend > 0)
  const topAds = [...ads]
    .filter((a) => a.spend > 0 && a.copyText)
    .sort((a, b) => (b.revenue / Math.max(b.spend, 1)) - (a.revenue / Math.max(a.spend, 1)))
    .slice(0, 2);
  for (const a of topAds) {
    const roas = (a.revenue / Math.max(a.spend, 1)).toFixed(2);
    const ctr = a.impressions ? ((a.clicks / a.impressions) * 100).toFixed(2) : '0';
    copies.push({
      id: `cp-ads-${a.id}`,
      type: 'Ads',
      campaign: a.campaign,
      date: a.date,
      text: a.copyText,
      metrics: `ROAS ${roas} | CTR ${ctr}% | ${a.purchases} compras`,
    });
  }
  // Top 2 organicos por engagement
  const topOrg = [...organic]
    .filter((o) => o.reach > 0 && o.copyText)
    .sort((a, b) => b.interactions / Math.max(b.reach, 1) - a.interactions / Math.max(a.reach, 1))
    .slice(0, 2);
  for (const o of topOrg) {
    const eng = o.reach ? ((o.interactions / o.reach) * 100).toFixed(2) : '0';
    copies.push({
      id: `cp-org-${o.id}`,
      type: 'Organico',
      campaign: o.campaign || o.social,
      date: o.date,
      text: o.copyText,
      metrics: `Engagement ${eng}% | ${o.interactions} interacciones`,
    });
  }
  return copies;
}

// ─── 4. Endpoints ──────────────────────────────────────────────────────────

async function leerBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch (_err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function endpointDatos(req, res, query) {
  // Aceptamos GET (con query) y POST (con body). En local no exigimos contraseña.
  let dateStart = query.dateStart;
  let dateEnd = query.dateEnd;
  if (req.method === 'POST') {
    const body = await leerBody(req);
    dateStart = body.dateStart || dateStart;
    dateEnd = body.dateEnd || dateEnd;
  }
  const { since, until } = (() => {
    const def = defaultRange();
    return {
      since: dateStart || def.since,
      until: dateEnd || def.until,
    };
  })();

  console.log(`\n📊 /api/contenido/datos  since=${since}  until=${until}`);
  const t0 = Date.now();

  const [adsResult, ig, page, igFollowers, fbFollowers, fbReachTotal] = await Promise.all([
    traerAds(since, until),
    traerInstagram(since, until),
    traerPagePosts(since, until),
    traerFollowersInstagram(since, until),
    traerFollowersPage(since, until),
    traerPageReach(since, until),
  ]);

  // Ordenar cada grupo por alcance descendente (el mejor arriba)
  ig.sort((a, b) => (b.reach || 0) - (a.reach || 0));
  page.sort((a, b) => (b.reach || 0) - (a.reach || 0));
  const organic = [...ig, ...page];
  const copies = derivarCopies(adsResult.ads, organic);
  const campaigns = ['all', ...adsResult.campaigns];

  const ms = Date.now() - t0;
  console.log(
    `   ✅ ads=${adsResult.ads.length} ig=${ig.length} fb=${page.length} ` +
      `ig_followers=${igFollowers.gained} fb_followers=${fbFollowers.gained} ` +
      `copies=${copies.length} en ${ms}ms`
  );

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      ads: adsResult.ads,
      organic,
      copies,
      campaigns,
      followersGained: {
        instagram: igFollowers.gained,
        facebook: fbFollowers.gained,
      },
      organicSummary: {
        facebook: { reach: fbReachTotal },
      },
      meta: { since, until, ms },
    })
  );
}

async function endpointTest(req, res) {
  const results = {};
  results.me = await metaFetch(`${GRAPH}/me?access_token=${TOKEN}`);
  if (AD_ACCOUNT_ID)
    results.adAccount = await metaFetch(
      `${GRAPH}/act_${AD_ACCOUNT_ID}?fields=name,currency,amount_spent,account_status&access_token=${TOKEN}`
    );
  if (PAGE_ID)
    results.page = await metaFetch(
      `${GRAPH}/${PAGE_ID}?fields=name,followers_count,fan_count&access_token=${TOKEN}`
    );
  if (IG_ID)
    results.instagram = await metaFetch(
      `${GRAPH}/${IG_ID}?fields=username,followers_count,media_count,name&access_token=${TOKEN}`
    );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(results, null, 2));
}

// ─── 5. Archivos estaticos ─────────────────────────────────────────────────

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function servirEstatico(urlPath, res) {
  // /rendimiento-contenido/ → index.html
  let rel = urlPath.replace(/^\/rendimiento-contenido\/?/, '');
  if (!rel || rel === '') rel = 'index.html';
  const filePath = path.join(publicDir, rel);
  // Proteccion contra path traversal
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    return res.end('Not Found');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
}

// ─── 6. Router ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams.entries());
  const p = url.pathname;

  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${p}`);

  try {
    if (p === '/' || p === '/rendimiento-contenido') {
      res.statusCode = 302;
      res.setHeader('Location', '/rendimiento-contenido/');
      return res.end();
    }
    if (p === '/api/contenido/datos') return endpointDatos(req, res, query);
    if (p === '/api/contenido/test') return endpointTest(req, res);
    if (p.startsWith('/rendimiento-contenido/')) return servirEstatico(p, res);

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      `No encontrado: ${p}\n\nRutas disponibles:\n  /rendimiento-contenido/\n  /api/contenido/datos\n  /api/contenido/test`
    );
  } catch (err) {
    console.error('💥 Error en handler:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message, stack: err.stack }));
  }
});

const PORT = 3100;
server.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Dashboard de Contenido — Servidor local');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  Abre en tu navegador:`);
  console.log(`    \x1b[36mhttp://localhost:${PORT}/rendimiento-contenido/\x1b[0m`);
  console.log('');
  console.log(`  Endpoints:`);
  console.log(`    /api/contenido/datos  → data real de Meta`);
  console.log(`    /api/contenido/test   → prueba de conexion`);
  console.log('');
  console.log('  Para detener: Ctrl+C');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});
