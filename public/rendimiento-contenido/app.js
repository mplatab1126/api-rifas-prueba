const TODAY = new Date();

function isoMinusDays(days) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_DATE_END = TODAY.toISOString().slice(0, 10);
const DEFAULT_DATE_START = isoMinusDays(22);

const state = {
  filters: {
    dateStart: DEFAULT_DATE_START,
    dateEnd: DEFAULT_DATE_END,
    campaigns: new Set(), // Set vacio = "Todas"
  },
  adsSort: "roas_desc",
  topRangeDays: 7,
  organicSocial: "instagram",
  favorites: new Set(),
  adsSectionCampaignFilter: '',
  transcripciones: null,
};

let dataSource = {
  campaigns: ["all", "Rifa Actual", "Semana Santa", "Abril Conversion"],
  ads: [
    {
      id: "ad-1",
      name: "Video Testimonial 01",
      date: "2026-04-05",
      campaign: "Rifa Actual",
      spend: 320000,
      purchases: 128,
      revenue: 1715000,
      impressions: 95000,
      clicks: 3670,
      videoViews3s: 45000,
      avgWatchTimeSec: 9,
      contentType: "Testimonial",
      hookType: "Prueba social",
      format: "Video",
      videoDurationSec: 22,
      copyText: "Hoy puedes convertir 1 boleta en una historia de victoria.",
      performanceDeltaPct: 14,
      activeDays: 6,
      transcription: "Cliente cuenta en primera persona como gano y como compro.",
    },
    {
      id: "ad-2",
      name: "Creativo Oferta Flash",
      date: "2026-04-04",
      campaign: "Rifa Actual",
      spend: 210000,
      purchases: 96,
      revenue: 1100000,
      impressions: 74000,
      clicks: 2750,
      videoViews3s: 28000,
      avgWatchTimeSec: 6,
      contentType: "Oferta",
      hookType: "Urgencia",
      format: "Video",
      videoDurationSec: 18,
      copyText: "Solo por hoy, activa tu oportunidad antes de medianoche.",
      performanceDeltaPct: -9,
      activeDays: 12,
      transcription: "Oferta limitada con llamada urgente a participar hoy.",
    },
    {
      id: "ad-3",
      name: "Carrusel Premio Mayor",
      date: "2026-03-30",
      campaign: "Semana Santa",
      spend: 460000,
      purchases: 142,
      revenue: 1960000,
      impressions: 143000,
      clicks: 4200,
      videoViews3s: 0,
      avgWatchTimeSec: 0,
      contentType: "Demostracion",
      hookType: "Beneficio directo",
      format: "Carrusel",
      videoDurationSec: 0,
      copyText: "Mira el premio mayor y como puedes entrar en minutos.",
      performanceDeltaPct: -23,
      activeDays: 19,
      transcription: "Secuencia visual del premio y pasos para participar.",
    },
    {
      id: "ad-4",
      name: "UGC + CTA Directo",
      date: "2026-03-27",
      campaign: "Semana Santa",
      spend: 180000,
      purchases: 58,
      revenue: 690000,
      impressions: 62000,
      clicks: 2190,
      videoViews3s: 22000,
      avgWatchTimeSec: 12,
      contentType: "UGC",
      hookType: "Curiosidad",
      format: "Video",
      videoDurationSec: 31,
      copyText: "Nadie creia esto hasta que vio el resultado real.",
      performanceDeltaPct: -28,
      activeDays: 24,
      transcription: "Usuario relata sorpresa del resultado y llamado a actuar.",
    },
    {
      id: "ad-5",
      name: "Reels Bonus 2x",
      date: "2026-03-22",
      campaign: "Abril Conversion",
      spend: 530000,
      purchases: 201,
      revenue: 2523000,
      impressions: 168000,
      clicks: 5190,
      videoViews3s: 85000,
      avgWatchTimeSec: 9,
      contentType: "Promo",
      hookType: "Urgencia",
      format: "Reel",
      videoDurationSec: 16,
      copyText: "Activa bonus 2x y multiplica tu oportunidad hoy.",
      performanceDeltaPct: 21,
      activeDays: 7,
      transcription: "Presentacion rapida del bonus y beneficios principales.",
    },
  ],
  organic: [
    {
      id: "org-1",
      social: "instagram",
      type: "video",
      title: "Ganador semanal contando su experiencia",
      date: "2026-04-05",
      campaign: "Rifa Actual",
      reach: 45600,
      interactions: 5240,
      saves: 610,
      shares: 810,
      followersGained: 690,
      contentType: "Testimonial",
      hookType: "Prueba social",
      format: "Reel",
      videoDurationSec: 24,
      copyText: "Mira como esta familia celebro su premio.",
      performanceDeltaPct: 18,
      activeDays: 5,
      transcription: "Historia breve del ganador con emociones y cierre CTA.",
    },
    {
      id: "org-2",
      social: "instagram",
      type: "post",
      title: "Post de resultados en vivo",
      date: "2026-04-03",
      campaign: "Rifa Actual",
      reach: 31800,
      interactions: 2900,
      saves: 401,
      shares: 506,
      followersGained: 170,
      contentType: "Resultados",
      hookType: "Credibilidad",
      format: "Post",
      videoDurationSec: 0,
      copyText: "Resultados reales de esta semana.",
      performanceDeltaPct: -12,
      activeDays: 14,
      transcription: "Resumen del resultado y recordatorio de proximas rifas.",
    },
    {
      id: "org-3",
      social: "facebook",
      type: "video",
      title: "Tutorial para comprar boletas",
      date: "2026-03-29",
      campaign: "Semana Santa",
      reach: 38200,
      interactions: 4340,
      saves: 700,
      shares: 420,
      followersGained: 520,
      contentType: "Tutorial",
      hookType: "Educativo",
      format: "Video",
      videoDurationSec: 20,
      copyText: "Aprende a comprar boletas en 3 pasos.",
      performanceDeltaPct: 9,
      activeDays: 8,
      transcription: "Guia paso a paso de compra y metodos de pago.",
    },
    {
      id: "org-4",
      social: "facebook",
      type: "post",
      title: "FAQ de pagos y premios",
      date: "2026-03-24",
      campaign: "Abril Conversion",
      reach: 21500,
      interactions: 1820,
      saves: 280,
      shares: 210,
      followersGained: 95,
      contentType: "FAQ",
      hookType: "Educativo",
      format: "Post",
      videoDurationSec: 0,
      copyText: "Respuestas claras para comprar sin dudas.",
      performanceDeltaPct: -19,
      activeDays: 17,
      transcription: "Preguntas frecuentes de horario, pagos y entrega.",
    },
    {
      id: "org-5",
      social: "instagram",
      type: "video",
      title: "Behind the scenes del sorteo",
      date: "2026-03-20",
      campaign: "Abril Conversion",
      reach: 27700,
      interactions: 3010,
      saves: 520,
      shares: 377,
      followersGained: 360,
      contentType: "Behind scenes",
      hookType: "Curiosidad",
      format: "Video",
      videoDurationSec: 28,
      copyText: "Asi se prepara un sorteo real por dentro.",
      performanceDeltaPct: 6,
      activeDays: 10,
      transcription: "Detras de camaras del equipo preparando el sorteo.",
    },
  ],
  copies: [
    {
      id: "cp-1",
      type: "Ads",
      campaign: "Rifa Actual",
      date: "2026-04-05",
      text: "Hoy puedes convertir 1 boleta en una historia de victoria. Compra ahora y asegura tu numero.",
      metrics: "ROAS 5.36 | CTR 3.86% | 128 compras",
    },
    {
      id: "cp-2",
      type: "Organico",
      campaign: "Rifa Actual",
      date: "2026-04-03",
      text: "Cuando alguien gana, gana toda la familia. Mira el resultado de hoy y participa para el proximo premio.",
      metrics: "Engagement 9.12% | 2.9K interacciones",
    },
    {
      id: "cp-3",
      type: "Ads",
      campaign: "Semana Santa",
      date: "2026-03-30",
      text: "Premio mayor activo por tiempo limitado. Activa tu oportunidad en menos de 30 segundos.",
      metrics: "ROAS 4.26 | CTR 2.94% | 142 compras",
    },
    {
      id: "cp-4",
      type: "Organico",
      campaign: "Abril Conversion",
      date: "2026-03-24",
      text: "Preguntas frecuentes resueltas en 1 post. Guardalo para revisar metodos de pago y horarios.",
      metrics: "Guardados 280 | Compartidos 210",
    },
  ],
};

const apiConnectors = {
  metaAdsApi: "/api/meta-ads",
  instagramGraphApi: "/api/instagram-graph",
  facebookGraphApi: "/api/facebook-graph",
  businessSuiteApi: "/api/business-suite",
  videoTranscriptionModule: "/api/video-transcriptions",
  contentInsightsModule: "/api/content-insights",
};

const refs = {
  dateStart: document.getElementById("dateStart"),
  dateEnd: document.getElementById("dateEnd"),
  applyFilters: document.getElementById("applyFilters"),
  resetFilters: document.getElementById("resetFilters"),
  insightsGrid: document.getElementById("insightsGrid"),
  alertsList: document.getElementById("alertsList"),
  trendsList: document.getElementById("trendsList"),
  adsSort: document.getElementById("adsSort"),
  adsMetrics: document.getElementById("adsMetrics"),
  adsTableBody: document.getElementById("adsTableBody"),
  organicMetrics: document.getElementById("organicMetrics"),
  organicList: document.getElementById("organicList"),
  organicFollowersHighlight: document.getElementById("organicFollowersHighlight"),
  topRange: document.getElementById("topRange"),
  topAdsGrid: document.getElementById("topAdsGrid"),
  topOrganicGrid: document.getElementById("topOrganicGrid"),
  btnGenerarTranscripciones: document.getElementById("btnGenerarTranscripciones"),
  transcripcionesStatus: document.getElementById("transcripcionesStatus"),
  transcripcionesAds: document.getElementById("transcripcionesAds"),
  transcripcionesOrganic: document.getElementById("transcripcionesOrganic"),
  organicSocialToggle: document.getElementById("organicSocialToggle"),
  syncMetaAds: document.getElementById("syncMetaAds"),
  syncInstagram: document.getElementById("syncInstagram"),
  lastSyncTime: document.getElementById("lastSyncTime"),
  adsSectionCampaignFilter: document.getElementById("adsSectionCampaignFilter"),
};

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function dateInRange(dateIso, startIso, endIso) {
  return dateIso >= startIso && dateIso <= endIso;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getRangeDays(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function formatDelta(current, previous) {
  if (!previous) return "sin base";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function computeDelta(current, previous, { inverse = false } = {}) {
  if (!previous) return { label: "sin base", direction: "flat" };
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  const label = `${sign}${delta.toFixed(1)}%`;
  let direction = "flat";
  if (Math.abs(delta) < 0.1) direction = "flat";
  else if (inverse) direction = delta < 0 ? "up" : "down";
  else direction = delta > 0 ? "up" : "down";
  return { label, direction };
}

function getGroupBest(items, groupKey, valueFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = item[groupKey] || "Sin definir";
    const current = map.get(key) || { total: 0, count: 0 };
    current.total += valueFn(item);
    current.count += 1;
    map.set(key, current);
  });
  const ranked = [...map.entries()]
    .map(([key, value]) => ({ key, avg: value.count ? value.total / value.count : 0 }))
    .sort((a, b) => b.avg - a.avg);
  return ranked[0];
}

function getDurationBucket(seconds) {
  if (!seconds) return "Sin video";
  if (seconds <= 15) return "0-15s";
  if (seconds <= 25) return "15-25s";
  return "26s+";
}

function calcAdsRecord(ad) {
  const roas = ad.spend ? ad.revenue / ad.spend : 0;
  const ctr = ad.impressions ? (ad.clicks / ad.impressions) * 100 : 0;
  const cpa = ad.purchases ? ad.spend / ad.purchases : 0;
  const cpm = ad.impressions ? (ad.spend / ad.impressions) * 1000 : 0;
  const hookRate = ad.impressions && ad.videoViews3s ? (ad.videoViews3s / ad.impressions) * 100 : null;
  const holdRate =
    ad.videoDurationSec && ad.avgWatchTimeSec ? (ad.avgWatchTimeSec / ad.videoDurationSec) * 100 : null;
  return { ...ad, roas, ctr, cpa, cpm, hookRate, holdRate };
}

function getDataByFilters(filters) {
  const { dateStart, dateEnd, campaigns } = filters;
  const selected = campaigns instanceof Set ? campaigns : new Set(campaigns || []);
  const campaignOk = (item) => selected.size === 0 || selected.has(item.campaign);
  const dateOk = (item) => dateInRange(item.date, dateStart, dateEnd);

  const ads = dataSource.ads.filter((ad) => campaignOk(ad) && dateOk(ad)).map(calcAdsRecord);
  const organic = dataSource.organic.filter(
    (post) => campaignOk(post) && dateOk(post) && post.social === state.organicSocial
  );
  const copies = dataSource.copies.filter((copy) => campaignOk(copy) && dateOk(copy));

  return { ads, organic, copies };
}

function getFilteredData() {
  return getDataByFilters(state.filters);
}

function getPreviousPeriodData() {
  const days = getRangeDays(state.filters.dateStart, state.filters.dateEnd);
  const previousEnd = addDays(state.filters.dateStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return getDataByFilters({
    dateStart: previousStart,
    dateEnd: previousEnd,
    campaigns: state.filters.campaigns,
  });
}

// ─── SVG / HTML helpers (ported from charts.jsx) ─────────────────────────────

function svgBarChart(data, height, labels) {
  const max = Math.max(...data, 1);
  const n = data.length || 1;
  const vw = 400;
  const labelH = 16;
  const totalH = height + labelH + 4;
  const gap = 3;
  const barW = (vw - gap * (n - 1)) / n;
  const maxVal = Math.max(...data);

  const grid = [0.25, 0.5, 0.75, 1].map(r => {
    const y = ((1 - r) * height).toFixed(1);
    return `<line x1="0" x2="${vw}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
  }).join('');

  const bars = data.map((v, i) => {
    const h = (v / max) * height;
    const x = (i * (barW + gap)).toFixed(1);
    const y = (height - h).toFixed(1);
    const isMax = v === maxVal && v > 0;
    return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="2" fill="${isMax ? 'var(--fg)' : 'var(--accent)'}" opacity="${isMax ? '1' : '0.75'}"/>`;
  }).join('');

  const lbs = (labels || []).map((l, i) => {
    const x = (i * (barW + gap) + barW / 2).toFixed(1);
    return `<text x="${x}" y="${height + 14}" text-anchor="middle" font-size="9" fill="var(--fg-faint)" font-family="JetBrains Mono, monospace">${l}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${vw} ${totalH}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block;overflow:visible;">${grid}${bars}${lbs}</svg>`;
}

function svgDonut(segments, size, thickness, centerValue, centerLabel) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const circles = segments.map(seg => {
    const frac = seg.value / total;
    const len = frac * c;
    const el = `<circle cx="${size/2}" cy="${size/2}" r="${r.toFixed(2)}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"/>`;
    offset += len;
    return el;
  }).join('');

  const cx = size / 2, cy = size / 2;
  let center = '';
  if (centerValue || centerLabel) {
    center = `<g transform="rotate(90 ${cx} ${cy})">`;
    if (centerValue) {
      const fs = size < 90 ? 12 : 15;
      const yv = centerLabel ? cy - 6 : cy + (fs / 3);
      center += `<text x="${cx}" y="${yv}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="var(--fg)" font-family="JetBrains Mono, monospace">${centerValue}</text>`;
    }
    if (centerLabel) {
      center += `<text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="7.5" fill="var(--fg-subtle)" font-family="Inter, sans-serif" letter-spacing="0.8">${centerLabel.toUpperCase()}</text>`;
    }
    center += '</g>';
  }

  return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg);display:block;flex-shrink:0;"><circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="var(--border)" stroke-width="${thickness}"/>${circles}${center}</svg>`;
}

function htmlHBar(label, sub, value, max, color, suffix) {
  const pct = max > 0 ? ((value / max) * 100).toFixed(1) : '0';
  return `<div class="hbar">
    <div class="hbar-meta">
      <div class="hbar-labels"><span class="hbar-label">${label}</span><span class="hbar-sub">${sub}</span></div>
      <span class="hbar-value tabular">${value}${suffix || ''}</span>
    </div>
    <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${color};"></div></div>
  </div>`;
}

function miniKpiHtml(label, value, delta, isAccent) {
  const isUp = delta.direction === 'up';
  const isDown = delta.direction === 'down';
  const col = isUp ? 'var(--green)' : isDown ? 'var(--red)' : 'var(--fg-faint)';
  const arrow = isUp ? '↑' : isDown ? '↓' : '•';
  return `<div class="mini-kpi${isAccent ? ' mini-kpi--accent' : ''}">
    <div class="mini-kpi-label">${label}</div>
    <div class="mini-kpi-value tabular">${value}</div>
    <div class="mini-kpi-delta" style="color:${col}">${arrow} ${delta.label} <span class="mini-kpi-period">vs ant.</span></div>
  </div>`;
}

function computeDailySpend(ads) {
  const days = Math.min(14, getRangeDays(state.filters.dateStart, state.filters.dateEnd));
  const endDate = new Date(`${state.filters.dateEnd}T00:00:00`);
  const byDate = {};
  ads.forEach(ad => { byDate[ad.date] = (byDate[ad.date] || 0) + ad.spend; });
  const data = [], labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    data.push(byDate[iso] || 0);
    labels.push(String(d.getDate()).padStart(2, '0'));
  }
  return { data, labels };
}

// ─────────────────────────────────────────────────────────────────────────────

function renderMetricCards(target, metrics) {
  target.innerHTML = metrics
    .map((m) => {
      const deltaHtml = m.delta
        ? `<span class="metric-delta ${m.delta.direction}">${
            m.delta.direction === "up" ? "↑" : m.delta.direction === "down" ? "↓" : "•"
          } ${m.delta.label}</span>`
        : "";
      return `
        <article class="metric-card">
          <p class="metric-title">${m.title}</p>
          <p class="metric-value">${m.value}</p>
          <div class="metric-foot">
            <span class="metric-note">${m.note}</span>
            ${deltaHtml}
          </div>
        </article>
      `;
    })
    .join("");
}

function getAdsSummary(ads) {
  const totals = ads.reduce(
    (acc, ad) => {
      acc.spend += ad.spend;
      acc.revenue += ad.revenue;
      acc.purchases += ad.purchases;
      acc.impressions += ad.impressions;
      acc.clicks += ad.clicks;
      acc.videoViews3s += ad.videoViews3s || 0;
      acc.watchTimeWeighted += (ad.avgWatchTimeSec || 0) * (ad.videoViews3s || 0);
      acc.durationWeighted += (ad.videoDurationSec || 0) * (ad.videoViews3s || 0);
      return acc;
    },
    {
      spend: 0,
      revenue: 0,
      purchases: 0,
      impressions: 0,
      clicks: 0,
      videoViews3s: 0,
      watchTimeWeighted: 0,
      durationWeighted: 0,
    }
  );
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
  const roas = totals.spend ? totals.revenue / totals.spend : 0;
  const cpa = totals.purchases ? totals.spend / totals.purchases : 0;
  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0;
  const hookRate = totals.impressions && totals.videoViews3s ? (totals.videoViews3s / totals.impressions) * 100 : 0;
  const holdRate = totals.durationWeighted ? (totals.watchTimeWeighted / totals.durationWeighted) * 100 : 0;
  return { ...totals, ctr, roas, cpa, cpm, hookRate, holdRate };
}

function getOrganicSummary(organic) {
  const totals = organic.reduce(
    (acc, post) => {
      acc.reach += post.reach;
      acc.interactions += post.interactions;
      acc.saves += post.saves;
      acc.shares += post.shares;
      return acc;
    },
    { reach: 0, interactions: 0, saves: 0, shares: 0 }
  );
  const engagement = totals.reach ? (totals.interactions / totals.reach) * 100 : 0;
  return { ...totals, engagement };
}

function renderInsightsAndSignals(ads, organic, copies) {
  if (!refs.insightsGrid && !refs.alertsList && !refs.trendsList) return;
  renderAutomaticInsights(ads, organic, copies);
  renderAlertsAndTrends(ads, organic);
}

function renderAutomaticInsights(ads, organic, copies) {
  if (!refs.insightsGrid) return;
  const bestContentType = getGroupBest(ads, "contentType", (item) => item.roas);
  const bestHook = getGroupBest(ads, "hookType", (item) => item.ctr);
  const bestFormat = getGroupBest(ads, "format", (item) => (item.clicks ? (item.purchases / item.clicks) * 100 : 0));
  const adVideoItems = ads.filter((item) => item.videoDurationSec > 0);
  const durationBest = getGroupBest(adVideoItems, "videoDurationSec", (item) => (item.clicks ? item.purchases / item.clicks : 0));
  const bestCopy = [...ads].sort((a, b) => b.roas * b.ctr - a.roas * a.ctr)[0];
  const bestCopyText = bestCopy ? bestCopy.copyText : copies[0]?.text;
  const organicChampion = [...organic].sort(
    (a, b) => b.interactions / Math.max(b.reach, 1) - a.interactions / Math.max(a.reach, 1)
  )[0];

  const insights = [
    {
      type: "positive",
      title: "Contenido ganador",
      message: bestContentType
        ? `Los contenidos tipo ${bestContentType.key} generan mejor ROAS promedio (${bestContentType.avg.toFixed(2)}).`
        : "Sin datos suficientes para evaluar tipo de contenido.",
      chip: "ROAS",
    },
    {
      type: "positive",
      title: "Hook con mejor CTR",
      message: bestHook
        ? `El hook ${bestHook.key} lidera el CTR (${bestHook.avg.toFixed(2)}%) en anuncios activos.`
        : "Sin datos suficientes para comparar hooks.",
      chip: "CTR",
    },
    {
      type: "action",
      title: "Formato que mas convierte",
      message: bestFormat
        ? `${bestFormat.key} muestra mayor conversion click-compra (${bestFormat.avg.toFixed(2)}%).`
        : "No hay conversiones suficientes para ranking de formatos.",
      chip: "Conversion",
    },
    {
      type: "action",
      title: "Duracion ideal de video",
      message: durationBest
        ? `Los videos en rango ${getDurationBucket(Number(durationBest.key))} convierten mejor para pauta.`
        : "Aun no hay base para optimizar duracion de video.",
      chip: "Duracion",
    },
    {
      type: "positive",
      title: "Copy recomendado",
      message: bestCopyText
        ? `"${bestCopyText}" es el copy con mejor combinacion de ROAS y CTR.`
        : "Sin copies destacados por ahora.",
      chip: "Copy",
    },
    {
      type: "action",
      title: "Organico para replicar",
      message: organicChampion
        ? `"${organicChampion.title}" tiene mejor engagement; usa su estructura para nuevas piezas.`
        : "Sin publicaciones organicas para analizar.",
      chip: "Engagement",
    },
  ];

  refs.insightsGrid.innerHTML = insights
    .map(
      (insight) => `
      <article class="insight-card ${insight.type}">
        <strong>${insight.title}</strong>
        <p>${insight.message}</p>
        <span class="insight-chip">${insight.chip}</span>
      </article>
    `
    )
    .join("");
}

function renderAlertsAndTrends(ads, organic) {
  if (!refs.alertsList && !refs.trendsList) return;
  const adSummary = getAdsSummary(ads);
  const organicSummary = getOrganicSummary(organic);
  const previous = getPreviousPeriodData();
  const previousAds = previous.ads;
  const previousAdSummary = getAdsSummary(previousAds);
  const previousOrganicSummary = getOrganicSummary(previous.organic);

  const avgSpend = ads.length ? adSummary.spend / ads.length : 0;
  const avgPurchases = ads.length ? adSummary.purchases / ads.length : 0;

  const highSpendLowConv = ads.find((ad) => ad.spend > avgSpend * 1.12 && ad.purchases < avgPurchases * 0.8);
  const lowCtrCreative = ads.find((ad) => ad.ctr < 2.6);
  const fallingAd = ads.find((ad) => ad.performanceDeltaPct <= -18);
  const staleCreative = ads.find((ad) => ad.activeDays >= 15);
  const fallingOrganic = organic.find((post) => post.performanceDeltaPct <= -15);
  const lowHook = ads.find((ad) => ad.hookRate !== null && ad.hookRate < 35);

  const alerts = [
    highSpendLowConv
      ? {
          level: "alert-high",
          title: "Gasto alto y baja conversion",
          text: `${highSpendLowConv.name} tiene inversion alta con pocas compras en el periodo.`,
        }
      : null,
    lowCtrCreative
      ? {
          level: "alert-medium",
          title: "CTR bajo detectado",
          text: `${lowCtrCreative.name} esta por debajo del CTR recomendado.`,
        }
      : null,
    lowHook
      ? {
          level: "alert-medium",
          title: "Hook rate bajo",
          text: `${lowHook.name} retiene menos del 35% en los primeros 3 segundos. Revisa intro.`,
        }
      : null,
    fallingAd
      ? {
          level: "alert-medium",
          title: "Anuncio perdiendo rendimiento",
          text: `${fallingAd.name} cae ${Math.abs(fallingAd.performanceDeltaPct)}% vs su media reciente.`,
        }
      : null,
    fallingOrganic
      ? {
          level: "alert-medium",
          title: "Contenido organico en caida",
          text: `"${fallingOrganic.title}" bajo rendimiento en la ultima ventana de analisis.`,
        }
      : null,
    staleCreative
      ? {
          level: "alert-low",
          title: "Creativo sin rotacion",
          text: `${staleCreative.name} lleva ${staleCreative.activeDays} dias sin cambio.`,
        }
      : null,
  ].filter(Boolean);

  refs.alertsList.innerHTML = (alerts.length ? alerts : [{ level: "alert-low", title: "Sin alertas criticas", text: "Todo estable por ahora." }])
    .map(
      (item) => `
      <article class="signal-item ${item.level}">
        <strong>${item.title}</strong>
        <p>${item.text}</p>
      </article>
    `
    )
    .join("");

  const trends = [
    { title: "CTR", text: `El CTR cambio ${formatDelta(adSummary.ctr, previousAdSummary.ctr)} frente al periodo anterior.` },
    { title: "ROAS", text: `El ROAS cambio ${formatDelta(adSummary.roas, previousAdSummary.roas)} en el mismo rango.` },
    { title: "Costo por compra", text: `El CPA cambio ${formatDelta(adSummary.cpa, previousAdSummary.cpa)} comparado al periodo previo.` },
    { title: "Hook rate", text: `El hook rate cambio ${formatDelta(adSummary.hookRate, previousAdSummary.hookRate)} vs periodo anterior.` },
    { title: "Hold rate", text: `El hold rate cambio ${formatDelta(adSummary.holdRate, previousAdSummary.holdRate)} vs periodo anterior.` },
    {
      title: "Alcance organico",
      text: `El alcance organico cambio ${formatDelta(organicSummary.reach, previousOrganicSummary.reach)}.`,
    },
    {
      title: "Engagement organico",
      text: `El engagement cambio ${formatDelta(organicSummary.engagement, previousOrganicSummary.engagement)}.`,
    },
  ];

  refs.trendsList.innerHTML = trends
    .map(
      (trend) => `
      <article class="signal-item trend">
        <strong>${trend.title}</strong>
        <p>${trend.text}</p>
      </article>
    `
    )
    .join("");
}

function renderAdsSection(ads) {
  const summary = getAdsSummary(ads);
  const prevSummary = getAdsSummary(getPreviousPeriodData().ads);

  // Limpiar clase metric-grid para poder usar la nueva estructura
  refs.adsMetrics.className = '';

  // Poblar filtro de campaña de la sección
  if (refs.adsSectionCampaignFilter) {
    const campaigns = [...new Set(ads.map((a) => a.campaign).filter(Boolean))].sort();
    const cur = state.adsSectionCampaignFilter;
    refs.adsSectionCampaignFilter.innerHTML =
      `<option value="">Todas</option>` +
      campaigns.map((c) =>
        `<option value="${c.replace(/"/g, "&quot;")}" ${cur === c ? "selected" : ""}>${c}</option>`
      ).join("");
  }

  // ── Deltas ────────────────────────────────────────────────────────────────
  const spendDelta     = computeDelta(summary.spend,     prevSummary.spend,     { inverse: true });
  const purchasesDelta = computeDelta(summary.purchases, prevSummary.purchases);
  const cpaDelta       = computeDelta(summary.cpa,       prevSummary.cpa,       { inverse: true });
  const roasDelta      = computeDelta(summary.roas,      prevSummary.roas);
  const ctrDelta       = computeDelta(summary.ctr,       prevSummary.ctr);

  // ── Chart data ────────────────────────────────────────────────────────────
  const { data: spendData, labels: spendLabels } = computeDailySpend(ads);

  // ── Hook rate distribution ────────────────────────────────────────────────
  const adsWithHook   = ads.filter(a => a.hookRate !== null);
  const hookExcellent = adsWithHook.filter(a => a.hookRate >= 40).length;
  const hookGood      = adsWithHook.filter(a => a.hookRate >= 25 && a.hookRate < 40).length;
  const hookLow       = adsWithHook.filter(a => a.hookRate < 25).length;
  const hookTotal     = Math.max(adsWithHook.length, 1);

  // ── Status / budget ───────────────────────────────────────────────────────
  const adsets         = dataSource.adsets || [];
  const activeCount    = adsets.length ? adsets.filter(a => a.status === 'ACTIVE').length  : ads.length;
  const pausedCount    = adsets.length ? adsets.filter(a => a.status !== 'ACTIVE').length  : 0;
  const totalAdsCount  = activeCount + pausedCount || ads.length;
  const totalDailyBudget = adsets.reduce((s, a) => s + (a.dailyBudget || 0), 0);
  const budgetUsedPct    = totalDailyBudget > 0
    ? Math.min(100, Math.round((summary.spend / totalDailyBudget) * 100))
    : null;

  // ── Budget card content ───────────────────────────────────────────────────
  const budgetInner = budgetUsedPct !== null
    ? `${svgDonut([
         { value: budgetUsedPct,       color: 'var(--accent)' },
         { value: 100 - budgetUsedPct, color: 'var(--bg-elev-2)' },
       ], 88, 12, budgetUsedPct + '%', 'Usado')}
       <div>
         <div class="ads-strip-label">Presupuesto del día</div>
         <div class="ads-strip-big tabular">${formatMoney(totalDailyBudget)}</div>
         <div class="ads-strip-sub">Gasto: ${formatMoney(summary.spend)}</div>
       </div>`
    : `<div>
         <div class="ads-strip-label">Gasto del periodo</div>
         <div class="ads-strip-big tabular">${formatMoney(summary.spend)}</div>
         <div class="ads-strip-sub">${ads.length} anuncio${ads.length !== 1 ? 's' : ''} · sin presupuesto diario</div>
       </div>`;

  // ── Hero + Strip HTML ─────────────────────────────────────────────────────
  refs.adsMetrics.innerHTML = `
    <div class="ads-hero">
      <div class="card ads-hero-chart">
        <div class="ads-hero-header">
          <div class="ads-hero-label">Gasto total en anuncios</div>
          <div class="ads-hero-value-row">
            <span class="ads-hero-currency tabular">$</span>
            <span class="ads-hero-number tabular">${formatNumber(summary.spend)}</span>
            <span class="ads-hero-delta ${spendDelta.direction === 'up' ? 'delta-up' : spendDelta.direction === 'down' ? 'delta-down' : 'delta-flat'}">
              ${spendDelta.direction === 'up' ? '↑' : spendDelta.direction === 'down' ? '↓' : '•'} ${spendDelta.label}
            </span>
          </div>
          <div class="ads-hero-sub">Periodo seleccionado · ${ads.length} anuncio${ads.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="ads-chart-wrap">
          ${svgBarChart(spendData, 150, spendLabels)}
        </div>
      </div>

      <div class="ads-mini-kpis">
        ${miniKpiHtml('Compras',      formatNumber(summary.purchases),          purchasesDelta, true)}
        ${miniKpiHtml('Costo/compra', formatMoney(summary.cpa),                 cpaDelta,       false)}
        ${miniKpiHtml('ROAS',         summary.roas.toFixed(2) + '×',            roasDelta,      true)}
        ${miniKpiHtml('CTR',          summary.ctr.toFixed(2) + '%',             ctrDelta,       false)}
      </div>
    </div>

    <div class="ads-strip">
      <div class="card ads-strip-card ads-strip-budget">${budgetInner}</div>

      <div class="card ads-strip-card">
        <div class="ads-strip-label">Distribución por hook rate</div>
        <div class="hbars">
          ${htmlHBar('Excelente', '≥40%',   hookExcellent, hookTotal, 'var(--accent)',                    ' ads')}
          ${htmlHBar('Bueno',     '25–40%', hookGood,      hookTotal, 'oklch(0.55 0.19 265 / 0.55)',      ' ads')}
          ${htmlHBar('Bajo',      '<25%',   hookLow,       hookTotal, 'var(--yellow)',                    ' ads')}
        </div>
      </div>

      <div class="card ads-strip-card ads-strip-status">
        <div class="ads-strip-label">Estado de anuncios</div>
        <div class="ads-strip-status-inner">
          ${svgDonut([
            { value: activeCount,              color: 'var(--green)' },
            { value: Math.max(pausedCount, 0), color: 'var(--yellow)' },
          ], 76, 10, String(totalAdsCount), 'Total')}
          <div class="ads-status-legend">
            <div class="legend-row">
              <span class="legend-dot" style="background:var(--green)"></span>
              <span class="legend-label">Activos</span>
              <span class="legend-val tabular">${activeCount}</span>
            </div>
            ${pausedCount > 0 ? `
            <div class="legend-row">
              <span class="legend-dot" style="background:var(--yellow)"></span>
              <span class="legend-label">Pausados</span>
              <span class="legend-val tabular">${pausedCount}</span>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Tabla ─────────────────────────────────────────────────────────────────
  const tableAds = state.adsSectionCampaignFilter
    ? ads.filter((a) => a.campaign === state.adsSectionCampaignFilter)
    : ads;

  const sorted = [...tableAds].sort((a, b) => {
    if (state.adsSort === "sales_desc") return b.revenue - a.revenue;
    if (state.adsSort === "cpa_asc") return a.cpa - b.cpa;
    return b.roas - a.roas;
  });

  if (!sorted.length) {
    refs.adsTableBody.innerHTML = `<tr><td colspan="10" class="empty">Sin datos para los filtros seleccionados.</td></tr>`;
    return;
  }

  refs.adsTableBody.innerHTML = sorted.map((ad, index) => {
    const adset = (dataSource.adsets || []).find((a) => a.id === ad.adsetId);
    const estadoBadge = adset
      ? (adset.status === "ACTIVE"
          ? `<span class="badge-active">Activo</span>`
          : `<span class="badge-paused">Pausado</span>`)
      : "—";
    const esTotal = adset && adset.dailyBudget === 0 && adset.lifetimeBudget > 0;
    const presupuestoTexto = adset
      ? (esTotal
          ? `${formatMoney(adset.lifetimeBudget)} <span style="color:var(--fg-faint);font-size:11px;">(total)</span>`
          : formatMoney(adset.dailyBudget))
      : "—";
    const canEdit = adset && !esTotal;
    const editBtn = canEdit
      ? `<button class="btn btn-ghost btn-sm btn-editar-ad"
           data-adset-id="${adset.id}" data-presupuesto-actual="${adset.dailyBudget}">Editar</button>`
      : `<span style="font-size:12px;color:var(--fg-faint);">—</span>`;

    const hookBarPct = ad.hookRate !== null ? Math.min(100, ad.hookRate * 2) : 0;
    const hookColor  = ad.hookRate >= 40 ? 'var(--accent)'
                     : ad.hookRate >= 25 ? 'oklch(0.55 0.19 265 / 0.7)'
                     : 'var(--yellow)';
    const roasColor  = ad.roas >= 20 ? 'var(--green)' : ad.roas >= 10 ? 'var(--fg)' : 'var(--fg-dim)';
    const isTop      = index === 0;

    return `
      <tr data-adset-id="${ad.adsetId || ""}">
        <td class="td-rank${isTop ? ' td-rank--top' : ''}">${String(index + 1).padStart(2, '0')}</td>
        <td>${isTop ? '<span class="top-badge">TOP</span> ' : ''}${ad.name}</td>
        <td class="td-num">${formatMoney(ad.spend)}</td>
        <td class="td-num">${formatNumber(ad.purchases)}</td>
        <td class="td-num">${formatMoney(ad.cpa)}</td>
        <td>
          <div class="hookrate-cell">
            <div class="hookrate-bar-track"><div class="hookrate-bar-fill" style="width:${hookBarPct}%;background:${hookColor};"></div></div>
            <span class="tabular td-num-sm">${ad.hookRate !== null ? formatPct(ad.hookRate) : '—'}</span>
          </div>
        </td>
        <td class="td-num" style="color:${roasColor};font-weight:500;">${ad.roas > 0 ? ad.roas.toFixed(2) + '×' : '—'}</td>
        <td>${estadoBadge}</td>
        <td class="celda-presupuesto-ad td-num">${presupuestoTexto}</td>
        <td>${editBtn}</td>
      </tr>`;
  }).join("");

  // Wiring botón Editar
  refs.adsTableBody.querySelectorAll(".btn-editar-ad").forEach((btn) => {
    btn.addEventListener("click", () => {
      const adsetId = btn.dataset.adsetId;
      const actual = parseInt(btn.dataset.presupuestoActual);
      const fila = btn.closest("tr");
      if (!fila) return;

      fila.querySelector(".celda-presupuesto-ad").innerHTML = `
        <input type="number" class="input-presupuesto" value="${actual}" min="4000" step="1000"
          style="width:120px;padding:5px 7px;border:1px solid var(--accent-border);border-radius:8px;font-size:13px;font-weight:600;">
        <span style="font-size:12px;color:var(--fg-faint);margin-left:4px;">COP/día</span>
      `;
      fila.querySelector("td:last-child").innerHTML = `
        <button class="btn btn-primary btn-sm btn-guardar-presupuesto" style="margin-right:4px;">Guardar</button>
        <button class="btn btn-ghost btn-sm btn-cancelar-presupuesto">Cancelar</button>
      `;

      fila.querySelector(".btn-guardar-presupuesto").addEventListener("click", () => {
        const nuevo = parseInt(fila.querySelector(".input-presupuesto").value);
        if (isNaN(nuevo) || nuevo < 4000) { alert("El presupuesto mínimo es $4.000 COP"); return; }
        if (nuevo === actual) { render(); return; }
        if (!confirm(`¿Cambiar presupuesto a ${formatMoney(nuevo)}/día?`)) return;
        actualizarPresupuesto(adsetId, nuevo, fila);
      });

      fila.querySelector(".btn-cancelar-presupuesto").addEventListener("click", () => render());
    });
  });
}

function renderOrganicSection(organic) {
  const totals = organic.reduce(
    (acc, post) => {
      acc.reach += post.reach;
      acc.interactions += post.interactions;
      acc.saves += post.saves;
      acc.shares += post.shares;
      return acc;
    },
    { reach: 0, interactions: 0, saves: 0, shares: 0 }
  );

  const prevOrganic = getPreviousPeriodData().organic;
  const prevTotals = prevOrganic.reduce(
    (acc, post) => {
      acc.reach += post.reach;
      acc.interactions += post.interactions;
      acc.saves += post.saves;
      acc.shares += post.shares;
      return acc;
    },
    { reach: 0, interactions: 0, saves: 0, shares: 0 }
  );

  renderOrganicFollowersHighlight(organic);

  // Para Facebook, el "alcance total" real se obtiene del insights a nivel
  // de Pagina (no se puede por post sin permisos extra). Si existe ese
  // agregado, lo usamos en vez de sumar reach por post.
  const fbAggregateReach =
    state.organicSocial === "facebook"
      ? dataSource.organicSummary?.facebook?.reach || 0
      : 0;
  const reachTotal = fbAggregateReach > 0 ? fbAggregateReach : totals.reach;

  renderMetricCards(refs.organicMetrics, [
    {
      title: "Alcance total",
      value: formatNumber(reachTotal),
      note: "Cuentas alcanzadas",
      delta: computeDelta(reachTotal, prevTotals.reach),
    },
    {
      title: "Interacciones",
      value: formatNumber(totals.interactions),
      note: "Likes, comentarios y mas",
      delta: computeDelta(totals.interactions, prevTotals.interactions),
    },
    {
      title: "Guardados",
      value: formatNumber(totals.saves),
      note: "Interes de valor futuro",
      delta: computeDelta(totals.saves, prevTotals.saves),
    },
    {
      title: "Compartidos",
      value: formatNumber(totals.shares),
      note: "Contenido viralizado",
      delta: computeDelta(totals.shares, prevTotals.shares),
    },
  ]);

  if (!organic.length) {
    refs.organicList.innerHTML = `<div class="empty">No hay publicaciones para estos filtros.</div>`;
    return;
  }

  refs.organicList.innerHTML = organic
    .map((post, index) => {
      const engagement = post.reach ? (post.interactions / post.reach) * 100 : 0;
      const thumbHtml = post.thumbnail
        ? `<div class="thumb thumb-img" style="background-image: url('${post.thumbnail.replace(/'/g, "%27")}');"></div>`
        : `<div class="thumb" style="background: linear-gradient(135deg, ${
            index % 2 === 0 ? "#1e40af, #0ea5e9" : "#7c3aed, #06b6d4"
          });"></div>`;
      return `
        <article class="organic-item">
          ${thumbHtml}
          <div>
            <strong>${post.title}</strong>
            <div class="copy-meta">${post.date} | ${post.social.toUpperCase()} | ${post.type.toUpperCase()}</div>
          </div>
          <div>
            <strong>${formatNumber(post.reach)}</strong>
            <div class="copy-meta">Alcance</div>
          </div>
          <div>
            <strong>${formatPct(engagement)}</strong>
            <div class="copy-meta">Engagement</div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderOrganicFollowersHighlight(organic) {
  const videoPosts = organic.filter((post) => post.type === "video");
  // Preferir el crecimiento de seguidores total de la cuenta (si vino del API).
  // Si no, caer al fallback de sumar followersGained por post (mock).
  const totalFromApi =
    (dataSource.followersGained && dataSource.followersGained[state.organicSocial]) || 0;
  const followersTotal =
    totalFromApi || videoPosts.reduce((acc, post) => acc + (post.followersGained || 0), 0);
  const bestVideo = [...videoPosts].sort(
    (a, b) => (b.interactions || 0) - (a.interactions || 0)
  )[0];

  refs.organicFollowersHighlight.innerHTML = `
    <p class="organic-highlight-title">Nuevos seguidores en el periodo</p>
    <div class="organic-highlight-grid">
      <div class="organic-highlight-item organic-highlight-followers">
        <strong>Seguidores ganados</strong>
        <p class="organic-highlight-main">${followersTotal >= 0 ? '+' : ''}${formatNumber(followersTotal)}</p>
      </div>
      <div class="organic-highlight-item">
        <strong>Video con más interacciones</strong>
        <span>${bestVideo ? bestVideo.title : "Sin videos en este filtro"}</span>
      </div>
    </div>
  `;
}

function renderOrganicSocialButtons() {
  if (!refs.organicSocialToggle) return;
  refs.organicSocialToggle.querySelectorAll(".social-btn").forEach((button) => {
    const isActive = button.dataset.social === state.organicSocial;
    button.classList.toggle("active", isActive);
  });
}

function renderTopContent(ads, organic) {
  const topSince = new Date(TODAY);
  topSince.setDate(topSince.getDate() - state.topRangeDays);
  const topSinceIso = topSince.toISOString().slice(0, 10);

  const adItems = ads
    .filter((ad) => ad.date >= topSinceIso)
    .map((ad) => ({
      id: ad.id,
      kind: "Ads",
      title: ad.name,
      date: ad.date,
      score: ad.roas * 100 + ad.revenue / 10000,
      metricA: `ROAS ${ad.roas.toFixed(2)}`,
      metricB: `Ventas ${formatMoney(ad.revenue)}`,
      thumbnail: ad.thumbnail || null,
    }));

  const organicItems = organic
    .filter((post) => post.date >= topSinceIso)
    .map((post) => ({
      id: post.id,
      kind: "Organico",
      title: post.title,
      date: post.date,
      score: post.interactions + post.shares * 2 + post.saves * 1.5,
      metricA: `Interacciones ${formatNumber(post.interactions)}`,
      metricB: `Alcance ${formatNumber(post.reach)}`,
      thumbnail: post.thumbnail || null,
    }));

  const topAds = adItems.sort((a, b) => b.score - a.score).slice(0, 3);
  const topOrganic = organicItems.sort((a, b) => b.score - a.score).slice(0, 3);

  refs.topAdsGrid.innerHTML = renderTopCards(topAds, "No hay contenidos pagos en este periodo.");
  refs.topOrganicGrid.innerHTML = renderTopCards(topOrganic, "No hay contenidos organicos en este periodo.");
}

function renderTopCards(items, emptyMessage) {
  if (!items.length) {
    return `<div class="card empty">${emptyMessage}</div>`;
  }

  return items
    .map((item, index) => {
      const thumbHtml = item.thumbnail
        ? `<div class="thumb thumb-img" style="background-image: url('${item.thumbnail.replace(/'/g, "%27")}');"></div>`
        : `<div class="thumb" style="background: linear-gradient(135deg, ${
            index % 2 === 0 ? "#06b6d4, #2563eb" : "#0ea5e9, #3b82f6"
          });"></div>`;
      return `
      <article class="content-card">
        ${thumbHtml}
        <span class="badge ${item.kind === "Ads" ? "ads" : "organic"}">${item.kind}</span>
        <strong>${item.title}</strong>
        <div class="copy-meta">${item.date}</div>
        <div>${item.metricA}</div>
        <div>${item.metricB}</div>
      </article>
    `;
    })
    .join("");
}

function renderTranscripciones() {
  if (!refs.transcripcionesAds || !refs.transcripcionesOrganic) return;
  const trans = state.transcripciones;

  const placeholder = `<div class="card empty" style="padding:20px;color:#64748b;font-size:13px;">
    Haz clic en <strong>Generar transcripciones ▶</strong> para obtener el texto de los videos más ganadores del periodo seleccionado.
  </div>`;

  if (!trans) {
    refs.transcripcionesAds.innerHTML = placeholder;
    refs.transcripcionesOrganic.innerHTML = placeholder;
    return;
  }

  refs.transcripcionesAds.innerHTML = (trans.ads || []).map((item) => `
    <article class="copy-card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="badge ads">Ad</span>
        <span style="font-size:12px;color:#64748b;">
          ${item.purchases ? item.purchases + ' compras' : '—'} &nbsp;|&nbsp; ${item.spend ? formatMoney(item.spend) : '—'}
        </span>
      </div>
      <strong style="font-size:14px;">${item.name}</strong>
      ${item.transcription
        ? `<p class="copy-text" style="margin-top:8px;white-space:pre-wrap;">${item.transcription}</p>
           <button class="btn btn-ghost" style="margin-top:8px;font-size:12px;" data-trans-text="${item.transcription.replace(/"/g, '&quot;')}">Copiar texto</button>`
        : `<p style="margin-top:8px;font-size:13px;color:#b91c1c;">⚠ ${item.error || 'No disponible'}</p>`
      }
    </article>
  `).join('') || `<div class="card empty">Sin anuncios de video en este periodo.</div>`;

  refs.transcripcionesOrganic.innerHTML = (trans.organic || []).map((item) => `
    <article class="copy-card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="badge organic">${(item.social || 'ig').toUpperCase()}</span>
        <span style="font-size:12px;color:#64748b;">${item.interactions ? formatNumber(item.interactions) + ' interacciones' : ''}</span>
      </div>
      <strong style="font-size:14px;">${item.title}</strong>
      ${item.transcription
        ? `<p class="copy-text" style="margin-top:8px;white-space:pre-wrap;">${item.transcription}</p>
           <button class="btn btn-ghost" style="margin-top:8px;font-size:12px;" data-trans-text="${item.transcription.replace(/"/g, '&quot;')}">Copiar texto</button>`
        : `<p style="margin-top:8px;font-size:13px;color:#b91c1c;">⚠ ${item.error || 'No disponible'}</p>`
      }
    </article>
  `).join('') || `<div class="card empty">Sin videos orgánicos en este periodo.</div>`;

  // Botones copiar transcripción
  [refs.transcripcionesAds, refs.transcripcionesOrganic].forEach((container) => {
    container.querySelectorAll("[data-trans-text]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.transText);
          btn.textContent = "Copiado ✓";
          setTimeout(() => { btn.textContent = "Copiar texto"; }, 1500);
        } catch (e) {
          btn.textContent = "No se pudo copiar";
        }
      });
    });
  });
}

async function generarTranscripciones() {
  const btn = refs.btnGenerarTranscripciones;
  const statusEl = refs.transcripcionesStatus;
  if (btn) { btn.disabled = true; btn.textContent = "Generando..."; }
  if (statusEl) statusEl.textContent = "Procesando videos — puede tomar hasta 60 segundos...";

  try {
    const contrasena = localStorage.getItem("asesor_pwd");

    // Usar todos los datos cargados (lo que trajo el último Sync),
    // no el subconjunto del filtro de fechas activo en la UI
    const allAds = (dataSource.ads || []).map(calcAdsRecord);

    // Top 3 ads con video, ordenados por compras
    const adsVideos = allAds
      .filter((a) => a.videoId)
      .sort((a, b) => b.purchases - a.purchases)
      .slice(0, 3)
      .map((a) => ({ id: a.id, videoId: a.videoId, videoUrl: a.videoUrl || null, name: a.name, purchases: a.purchases, spend: a.spend }));

    // Top 3 videos orgánicos (cualquier red) por interacciones
    const organicVideos = (dataSource.organic || [])
      .filter((p) => p.type === "video" && p.mediaUrl)
      .sort((a, b) => (b.interactions || 0) - (a.interactions || 0))
      .slice(0, 3)
      .map((p) => ({ id: p.id, mediaUrl: p.mediaUrl, title: p.title, social: p.social, interactions: p.interactions }));

    if (!adsVideos.length && !organicVideos.length) {
      if (statusEl) statusEl.textContent = "No hay videos disponibles en el periodo seleccionado. Prueba con otro rango de fechas.";
      return;
    }

    const r = await fetch("/api/contenido/transcribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrasena, adsVideos, organicVideos }),
    });

    const json = await r.json();
    if (!r.ok || json.status !== "ok") {
      if (statusEl) statusEl.textContent = "Error: " + (json.mensaje || "No se pudo generar la transcripción");
      return;
    }

    state.transcripciones = { ads: json.ads, organic: json.organic };

    const total = (json.ads || []).filter((x) => x.transcription).length + (json.organic || []).filter((x) => x.transcription).length;
    if (statusEl) statusEl.textContent = `✅ ${total} transcripción(es) generada(s) — ${new Date().toLocaleTimeString("es-CO")}`;
    renderTranscripciones();
  } catch (err) {
    if (statusEl) statusEl.textContent = "Error de conexión: " + err.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Generar transcripciones ▶"; }
  }
}

async function actualizarPresupuesto(adsetId, nuevoPresupuesto, fila) {
  const contrasena = localStorage.getItem("asesor_pwd");
  const btnGuardar = fila.querySelector(".btn-guardar-presupuesto");
  const btnCancelar = fila.querySelector(".btn-cancelar-presupuesto");
  if (btnGuardar) btnGuardar.disabled = true;
  if (btnCancelar) btnCancelar.disabled = true;
  if (btnGuardar) btnGuardar.textContent = "Guardando...";

  try {
    const r = await fetch("/api/contenido/presupuesto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrasena, adsetId, nuevoPresupuesto }),
    });
    const json = await r.json();
    if (!r.ok || json.status !== "ok") {
      alert("Error al actualizar: " + (json.mensaje || "Error desconocido"));
      if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = "Guardar"; }
      if (btnCancelar) btnCancelar.disabled = false;
      return;
    }
    // Actualizar localmente para reflejar el cambio sin re-sincronizar
    const adset = dataSource.adsets.find((a) => a.id === adsetId);
    if (adset) adset.dailyBudget = parseInt(nuevoPresupuesto);
    render();
  } catch (err) {
    alert("Error de conexión: " + err.message);
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = "Guardar"; }
    if (btnCancelar) btnCancelar.disabled = false;
  }
}


function render() {
  const { ads, organic, copies } = getFilteredData();
  renderInsightsAndSignals(ads, organic, copies);
  renderOrganicSocialButtons();
  renderAdsSection(ads);
  renderOrganicSection(organic);
  renderTopContent(ads, organic);
  renderTranscripciones();
}

function populateFilters() {
  refs.dateStart.value = state.filters.dateStart;
  refs.dateEnd.value = state.filters.dateEnd;
}


function setupEvents() {
  refs.applyFilters.addEventListener("click", () => {
    state.filters.dateStart = refs.dateStart.value;
    state.filters.dateEnd = refs.dateEnd.value;
    render();
  });

  refs.resetFilters.addEventListener("click", () => {
    state.filters = {
      dateStart: DEFAULT_DATE_START,
      dateEnd: DEFAULT_DATE_END,
      campaigns: new Set(),
    };
    refs.dateStart.value = state.filters.dateStart;
    refs.dateEnd.value = state.filters.dateEnd;
    render();
  });

  refs.adsSort.addEventListener("change", (event) => {
    state.adsSort = event.target.value;
    render();
  });

  refs.topRange.addEventListener("change", (event) => {
    state.topRangeDays = Number(event.target.value);
    render();
  });

  refs.organicSocialToggle.addEventListener("click", (event) => {
    const button = event.target.closest(".social-btn");
    if (!button) return;
    state.organicSocial = button.dataset.social;
    render();
  });

  if (refs.adsSectionCampaignFilter) {
    refs.adsSectionCampaignFilter.addEventListener("change", (e) => {
      state.adsSectionCampaignFilter = e.target.value;
      renderAdsSection(getFilteredData().ads);
    });
  }

  if (refs.btnGenerarTranscripciones) {
    refs.btnGenerarTranscripciones.addEventListener("click", generarTranscripciones);
  }
}

populateFilters();
setupEvents();
render();

// ─── Conexión con data real de Meta ────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(start, end) {
  return `rc_${start}_${end}`;
}

function readCache(start, end) {
  try {
    const raw = localStorage.getItem(cacheKey(start, end));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(start, end));
      return null;
    }
    return entry;
  } catch (e) { return null; }
}

function writeCache(start, end, json) {
  try {
    localStorage.setItem(cacheKey(start, end), JSON.stringify({ ts: Date.now(), json }));
  } catch (e) { /* localStorage lleno, ignorar */ }
}

const statusBanner = document.createElement("div");
statusBanner.id = "statusBanner";
statusBanner.style.cssText =
  "position:fixed;top:12px;right:12px;z-index:9999;padding:10px 14px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.14);transition:opacity .3s";
document.body.appendChild(statusBanner);

function setBanner(text, color) {
  statusBanner.textContent = text;
  statusBanner.style.background = color;
  statusBanner.style.color = "#fff";
  statusBanner.style.opacity = "1";
}

function hideBanner() {
  statusBanner.style.opacity = "0";
}

function setLoadingState(loading) {
  // Los botones Sync nunca se deshabilitan — siempre deben responder al clic
  if (refs.syncMetaAds) refs.syncMetaAds.textContent = loading ? "Sincronizando..." : "Sync Meta Ads";
  if (refs.syncInstagram) refs.syncInstagram.textContent = loading ? "Sincronizando..." : "Sync Instagram";
  // Los filtros sí se bloquean para evitar envíos dobles
  const filterEls = [refs.applyFilters, refs.resetFilters];
  filterEls.forEach((el) => { if (el) el.disabled = loading; });
  document.querySelectorAll(".range-chip").forEach((c) => { c.disabled = loading; });
}

function applyData(json) {
  dataSource = {
    campaigns: json.campaigns?.length ? json.campaigns : ["all"],
    ads: json.ads || [],
    organic: json.organic || [],
    copies: json.copies || [],
    followersGained: json.followersGained || { instagram: 0, facebook: 0 },
    organicSummary: json.organicSummary || {},
    adsets: json.adsets || [],
  };
  const realCampaigns = new Set((dataSource.campaigns || []).filter((c) => c && c !== "all"));
  for (const sel of [...state.filters.campaigns]) {
    if (!realCampaigns.has(sel)) state.filters.campaigns.delete(sel);
  }
  populateFilters();
  render();
}

function updateLastSyncLabel(ts) {
  if (!refs.lastSyncTime) return;
  const mins = Math.round((Date.now() - ts) / 60000);
  const label =
    mins < 1 ? "hace menos de 1 min" :
    mins === 1 ? "hace 1 min" :
    mins < 60 ? `hace ${mins} min` :
    `hace ${Math.floor(mins / 60)}h`;
  refs.lastSyncTime.textContent = `Última sync: ${label}`;
}

async function cargarDataReal(forceRefresh = false) {
  const { dateStart, dateEnd } = state.filters;

  if (!forceRefresh) {
    const cached = readCache(dateStart, dateEnd);
    if (cached) {
      applyData(cached.json);
      updateLastSyncLabel(cached.ts);
      setBanner("Datos del caché — Sync para refrescar", "#0369a1");
      setTimeout(hideBanner, 2000);
      return;
    }
  }

  setLoadingState(true);
  setBanner("Sincronizando con Meta...", "#2563eb");

  try {
    const esLocal = /^localhost|^127\.0\.0\.1/.test(window.location.hostname);
    const contrasena = localStorage.getItem("asesor_pwd");
    if (!contrasena && !esLocal) {
      window.location.href = "/admin";
      return;
    }
    const r = await fetch("/api/contenido/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrasena, dateStart, dateEnd }),
    });
    if (r.status === 401 || r.status === 403) {
      setBanner("Acceso denegado a este dashboard", "#b91c1c");
      setTimeout(() => (window.location.href = "/admin"), 1500);
      return;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json || !Array.isArray(json.ads)) throw new Error("Respuesta inválida del servidor");

    const now = Date.now();
    writeCache(dateStart, dateEnd, json);
    applyData(json);
    updateLastSyncLabel(now);

    const total = dataSource.ads.length + dataSource.organic.length;
    setBanner(`✅ Sincronizado (${total} elementos)`, "#15803d");
    setTimeout(hideBanner, 2500);
  } catch (err) {
    console.warn("No se pudo cargar data real, usando mock:", err);
    setBanner("⚠️ Sin conexión a Meta — mostrando ejemplo", "#b91c1c");
    setTimeout(hideBanner, 4000);
  } finally {
    setLoadingState(false);
  }
}

// Los botones Sync fuerzan refresco ignorando el caché
if (refs.syncMetaAds) refs.syncMetaAds.addEventListener("click", () => cargarDataReal(true));
if (refs.syncInstagram) refs.syncInstagram.addEventListener("click", () => cargarDataReal(true));

// Aplicar/limpiar filtros: usa caché si las fechas no cambiaron
refs.applyFilters.addEventListener("click", cargarDataReal);
refs.resetFilters.addEventListener("click", cargarDataReal);

function aplicarRangoRapido(range) {
  const hoy = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  let start, end;
  switch (range) {
    case "today": { start = end = iso(hoy); break; }
    case "yesterday": { const y = new Date(hoy); y.setDate(y.getDate() - 1); start = end = iso(y); break; }
    case "last7": { const s = new Date(hoy); s.setDate(s.getDate() - 6); start = iso(s); end = iso(hoy); break; }
    case "month": { const s = new Date(hoy.getFullYear(), hoy.getMonth(), 1); start = iso(s); end = iso(hoy); break; }
    default: return;
  }
  refs.dateStart.value = start;
  refs.dateEnd.value = end;
  state.filters.dateStart = start;
  state.filters.dateEnd = end;
  document.querySelectorAll(".range-chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.range === range);
  });
  cargarDataReal();
}

document.querySelectorAll(".range-chip").forEach((btn) => {
  btn.addEventListener("click", () => aplicarRangoRapido(btn.dataset.range));
});

function limpiarChipActivo() {
  document.querySelectorAll(".range-chip.active").forEach((c) => c.classList.remove("active"));
}
refs.dateStart.addEventListener("change", limpiarChipActivo);
refs.dateEnd.addEventListener("change", limpiarChipActivo);
refs.resetFilters.addEventListener("click", limpiarChipActivo);

cargarDataReal();
