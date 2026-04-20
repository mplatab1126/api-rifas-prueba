/**
 * Endpoint del Dashboard de Contenido.
 *
 * Devuelve en una sola llamada toda la data del dashboard:
 *   - Anuncios (insights por ad agrupados por ad)
 *   - Posts organicos de Instagram
 *   - Posts organicos de la Pagina de Facebook
 *   - Seguidores ganados por canal
 *   - Alcance agregado de la Pagina
 *   - Copys ganadores
 *   - Lista de campañas
 *
 * Autenticacion: solo gerencia del Dashboard de Contenido
 *   - Mateo      (LosP)
 *   - Alejo Plata (a9)
 *   - Valeria    (v2)
 *
 * NO modifica nada del sistema existente. Solo lee de Meta.
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v19.0';
const TOKEN = process.env.CONTENIDO_META_TOKEN;
const AD_ACCOUNT_ID = process.env.CONTENIDO_AD_ACCOUNT_ID;
const PAGE_ID = process.env.CONTENIDO_PAGE_ID;
const IG_ID = process.env.CONTENIDO_IG_ACCOUNT_ID;

const ACCESO_PERMITIDO = ['mateo', 'alejo p', 'alejo plata', 'valeria'];

// Cache en memoria (vive mientras la lambda este caliente)
let pageTokenCache = null;

async function metaFetch(url) {
  try {
    const r = await fetch(url);
    const json = await r.json();
    if (json.error) return { data: [], error: json.error };
    return json;
  } catch (err) {
    return { data: [], error: { message: err.message } };
  }
}

async function getPageAccessToken() {
  if (pageTokenCache) return pageTokenCache;
  if (!PAGE_ID) return null;
  const r = await metaFetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${TOKEN}`);
  if (r && r.access_token) {
    pageTokenCache = r.access_token;
    return pageTokenCache;
  }
  return null;
}

function transformarAd(item) {
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
  let conversations = 0;
  const c = (item.actions || []).find(
    (a) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
  );
  if (c) conversations = parseInt(c.value) || 0;

  let videoViews3s = 0;
  const vv = (item.actions || []).find((a) => a.action_type === 'video_view');
  if (vv) videoViews3s = parseInt(vv.value) || 0;

  let avgWatchTimeSec = 0;
  const vw = (item.video_avg_time_watched_actions || []).find((a) => a.action_type === 'video_view');
  if (vw) avgWatchTimeSec = parseFloat(vw.value) || 0;

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
    format: null,
    videoDurationSec: 0,
    copyText: '',
    performanceDeltaPct: 0,
    activeDays: 0,
    transcription: '',
    thumbnail: null,
  };
}

function agruparAds(insights) {
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
      if (row.date_start > existing.date_start) existing.date_start = row.date_start;
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
      const v = (row.video_avg_time_watched_actions || []).find((a) => a.action_type === 'video_view');
      if (v) {
        existing._durationWatchedTotal += parseFloat(v.value) || 0;
        existing._avgCount += 1;
      }
    }
  }
  for (const ad of map.values()) {
    const promedio = ad._durationWatchedTotal / (ad._avgCount || 1);
    ad.video_avg_time_watched_actions = [{ action_type: 'video_view', value: String(promedio) }];
  }
  return [...map.values()];
}

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function enrichCreativos(ads) {
  if (!ads.length) return ads;

  // Paso 1: un solo request por lote de 50 para traer todos los creativos
  const grupos = chunk(ads, 50);
  await Promise.all(grupos.map(async (grupo) => {
    const ids = grupo.map((a) => a.id).join(',');
    const r = await metaFetch(
      `${GRAPH}?ids=${ids}&fields=creative{body,object_type,video_id,thumbnail_url,image_url}&access_token=${TOKEN}`
    );
    if (!r || r.error) return;
    for (const ad of grupo) {
      const d = r[ad.id];
      if (!d?.creative) continue;
      const c = d.creative;
      ad.copyText = c.body || '';
      ad.thumbnail = c.thumbnail_url || c.image_url || null;
      const ot = (c.object_type || '').toUpperCase();
      if (ot.includes('VIDEO')) ad.format = 'Video';
      else if (ot.includes('CAROUSEL')) ad.format = 'Carrusel';
      else if (ot.includes('PHOTO') || ot.includes('IMAGE')) ad.format = 'Imagen';
      if (c.video_id) ad._videoId = c.video_id;
    }
  }));

  // Paso 2: un solo request por lote de 50 para traer detalles de videos
  const videoAds = ads.filter((a) => a._videoId);
  if (videoAds.length) {
    const uniqueIds = [...new Set(videoAds.map((a) => a._videoId))];
    const videoData = {};
    await Promise.all(chunk(uniqueIds, 50).map(async (vids) => {
      const vr = await metaFetch(
        `${GRAPH}?ids=${vids.join(',')}&fields=length,picture&access_token=${TOKEN}`
      );
      if (vr && !vr.error) Object.assign(videoData, vr);
    }));
    for (const ad of videoAds) {
      const v = videoData[ad._videoId];
      if (v?.length) ad.videoDurationSec = Math.round(parseFloat(v.length));
      if (v?.picture && !ad.thumbnail) ad.thumbnail = v.picture;
      delete ad._videoId;
    }
  }

  return ads;
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
    const plays = crossposted || views;
    const likes = metric('likes');
    const comments = metric('comments');
    const shares = metric('shares');
    const saves = metric('saved');
    const totalInt = metric('total_interactions') || likes + comments + shares + saves;
    const type = (m.media_type || '').toLowerCase();
    const esVideo = type === 'video' || type === 'reels' || m.media_product_type === 'REELS';
    const displayReach = esVideo && plays > 0 ? plays : reach;
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
  if (!pageToken) return [];
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  const url = `${GRAPH}/${PAGE_ID}/posts?fields=id,message,created_time,permalink_url,full_picture,attachments{media_type,type,media{image{src}}},shares&since=${sinceTs}&until=${untilTs}&limit=50&access_token=${pageToken}`;
  const r = await metaFetch(url);
  if (!r.data) return [];
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
    const interactions = shares;
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
  if (!IG_ID) return 0;
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  const r = await metaFetch(
    `${GRAPH}/${IG_ID}/insights?metric=follower_count&period=day&since=${sinceTs}&until=${untilTs}&access_token=${TOKEN}`
  );
  const values = r.data?.[0]?.values || [];
  return values.reduce((acc, v) => acc + (parseInt(v.value) || 0), 0);
}

async function traerFollowersPage(since, until) {
  if (!PAGE_ID) return 0;
  const pageToken = await getPageAccessToken();
  if (!pageToken) return 0;
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  for (const metric of ['page_follows', 'page_fans']) {
    const r = await metaFetch(
      `${GRAPH}/${PAGE_ID}/insights?metric=${metric}&period=day&since=${sinceTs}&until=${untilTs}&access_token=${pageToken}`
    );
    const values = r.data?.[0]?.values;
    if (values && values.length > 1) {
      return (parseInt(values[values.length - 1].value) || 0) - (parseInt(values[0].value) || 0);
    }
  }
  return 0;
}

async function traerPageReach(since, until) {
  if (!PAGE_ID) return 0;
  const pageToken = await getPageAccessToken();
  if (!pageToken) return 0;
  const sinceTs = Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000);
  const untilTs = Math.floor(new Date(`${until}T23:59:59Z`).getTime() / 1000);
  for (const metric of ['page_impressions_unique', 'page_impressions']) {
    const r = await metaFetch(
      `${GRAPH}/${PAGE_ID}/insights?metric=${metric}&period=day&since=${sinceTs}&until=${untilTs}&access_token=${pageToken}`
    );
    const values = r.data?.[0]?.values;
    if (values && values.length) {
      return values.reduce((acc, v) => acc + (parseInt(v.value) || 0), 0);
    }
  }
  return 0;
}

function derivarCopies(ads, organic) {
  const copies = [];
  const topAds = [...ads]
    .filter((a) => a.spend > 0 && a.copyText)
    .sort((a, b) => b.revenue / Math.max(b.spend, 1) - a.revenue / Math.max(a.spend, 1))
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

function defaultRange() {
  const until = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() - 22);
  const since = d.toISOString().slice(0, 10);
  return { since, until };
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, dateStart, dateEnd } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
  if (!ACCESO_PERMITIDO.includes(nombreAsesor.toLowerCase().trim())) {
    return res.status(403).json({ status: 'error', mensaje: 'Acceso restringido al Dashboard de Contenido' });
  }

  if (!TOKEN) {
    return res.status(500).json({ status: 'error', mensaje: 'Falta CONTENIDO_META_TOKEN en las variables de entorno' });
  }

  const def = defaultRange();
  const since = dateStart || def.since;
  const until = dateEnd || def.until;

  try {
    const [adsResult, ig, page, igFollowers, fbFollowers, fbReachTotal] = await Promise.all([
      traerAds(since, until),
      traerInstagram(since, until),
      traerPagePosts(since, until),
      traerFollowersInstagram(since, until),
      traerFollowersPage(since, until),
      traerPageReach(since, until),
    ]);

    ig.sort((a, b) => (b.reach || 0) - (a.reach || 0));
    page.sort((a, b) => (b.reach || 0) - (a.reach || 0));
    const organic = [...ig, ...page];
    const copies = derivarCopies(adsResult.ads, organic);
    const campaigns = ['all', ...adsResult.campaigns];

    return res.status(200).json({
      status: 'ok',
      ads: adsResult.ads,
      organic,
      copies,
      campaigns,
      followersGained: { instagram: igFollowers, facebook: fbFollowers },
      organicSummary: { facebook: { reach: fbReachTotal } },
      meta: { since, until },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', mensaje: err.message });
  }
}
