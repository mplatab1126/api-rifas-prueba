import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const GERENCIA = ['Mateo', 'Alejo P', 'Alejo Plata'];

async function fetchTagsPaginated(token, debug = false) {
  const tags = [];
  let page = 1;
  let hasMore = true;
  let rawFirstPage = null;
  while (hasMore) {
    const rawResp = await fetch(`https://chateapro.app/api/flow/tags?limit=50&page=${page}`, {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const statusCode = rawResp.status;
    const resp = await rawResp.json();
    if (page === 1 && debug) {
      rawFirstPage = { status: statusCode, keys: Object.keys(resp), meta: resp.meta || null, dataLength: resp.data ? resp.data.length : 'no data field', sample: resp.data ? resp.data.slice(0, 2) : resp };
    }
    if (resp.data) tags.push(...resp.data);
    hasMore = resp.meta && page < resp.meta.last_page;
    page++;
  }
  return debug ? { tags, rawFirstPage } : tags;
}

async function fetchSubscribersByTag(token, tagNs) {
  const subs = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const resp = await fetch(`https://chateapro.app/api/subscribers?tag_ns=${tagNs}&limit=50&page=${page}`, {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (resp.data && resp.data.length > 0) {
      subs.push(...resp.data);
      hasMore = resp.meta && page < resp.meta.last_page;
      page++;
    } else {
      hasMore = false;
    }
  }
  return subs;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { contrasena, accion, ...payload } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!GERENCIA.includes(nombreAsesor)) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede usar esta función.' });

  const TOKEN_L1 = process.env.CHATEA_TOKEN_LINEA_1;
  const TOKEN_L2 = process.env.CHATEA_TOKEN_LINEA_2;

  // ── TAGS: Lista los tags que contienen "falló" o "fallo" ──
  if (accion === 'tags') {
    try {
      let error1 = null, error2 = null;
      let tags1 = [], tags2 = [];
      let raw1 = null, raw2 = null;

      try {
        const r1 = await fetchTagsPaginated(TOKEN_L1, true);
        tags1 = r1.tags; raw1 = r1.rawFirstPage;
      } catch (e) { error1 = e.message; }
      try {
        const r2 = await fetchTagsPaginated(TOKEN_L2, true);
        tags2 = r2.tags; raw2 = r2.rawFirstPage;
      } catch (e) { error2 = e.message; }

      const falloTags = [];
      for (const t of tags1) {
        if (t.name.toLowerCase().includes('falló') || t.name.toLowerCase().includes('fallo')) {
          falloTags.push({ name: t.name, tag_ns: t.tag_ns, linea: 1 });
        }
      }
      for (const t of tags2) {
        if (t.name.toLowerCase().includes('falló') || t.name.toLowerCase().includes('fallo')) {
          falloTags.push({ name: t.name, tag_ns: t.tag_ns, linea: 2 });
        }
      }

      return res.json({
        status: 'ok',
        tags: falloTags,
        debug: {
          total_tags_linea1: tags1.length,
          total_tags_linea2: tags2.length,
          error_linea1: error1,
          error_linea2: error2,
          token_l1_presente: !!TOKEN_L1,
          token_l2_presente: !!TOKEN_L2,
          raw_linea1: raw1,
          raw_linea2: raw2
        }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: 'Error al obtener tags: ' + error.message });
    }
  }

  // ── PREVIEW: Busca suscriptores bloqueados y cruza con deudas en Supabase ──
  if (accion === 'preview') {
    try {
      const tagNsList = payload.tag_ns_list || (payload.tag_ns ? [payload.tag_ns] : []);
      if (tagNsList.length === 0) return res.status(400).json({ status: 'error', mensaje: 'Falta el tag.' });

      const allSubscribers = [];
      const seen = new Set();

      for (const tagNs of tagNsList) {
        const token = tagNs.startsWith('f166221') ? TOKEN_L2 : TOKEN_L1;
        const subs = await fetchSubscribersByTag(token, tagNs);
        for (const s of subs) {
          if (!seen.has(s.user_ns)) {
            seen.add(s.user_ns);
            allSubscribers.push(s);
          }
        }
      }

      const withPhone = allSubscribers.filter(s => s.phone && s.channel === 'whatsapp_cloud');

      if (withPhone.length === 0) {
        return res.json({ status: 'ok', total_chateapro: 0, total_con_deuda: 0, total_saldo: 0, clientes: [] });
      }

      const phoneMap = {};
      for (const s of withPhone) {
        const digits = String(s.phone).replace(/\D/g, '');
        const last10 = digits.slice(-10);
        const info = {
          fullPhone: `+${digits}`,
          chateaName: s.name || s.first_name || 'Sin nombre',
          user_ns: s.user_ns
        };
        // Mapeamos tanto el número completo como los últimos 10 dígitos
        // para compatibilidad con registros viejos (10 dígitos) y nuevos (con indicativo)
        if (!phoneMap[digits]) phoneMap[digits] = info;
        if (!phoneMap[last10]) phoneMap[last10] = info;
      }

      const phoneKeys = [...new Set(Object.keys(phoneMap))];
      const fechaCorte = payload.ultimo_abono_antes_de || null;
      const maxAbonado = payload.max_abonado !== undefined && payload.max_abonado !== null ? Number(payload.max_abonado) : null;

      let allBoletas = [];
      const batchSize = 100;
      for (let i = 0; i < phoneKeys.length; i += batchSize) {
        const batch = phoneKeys.slice(i, i + batchSize);
        let query = supabase
          .from('boletas')
          .select('numero, saldo_restante, total_abonado, telefono_cliente, clientes(nombre, apellido)')
          .in('telefono_cliente', batch)
          .gt('saldo_restante', 0);
        if (maxAbonado !== null) query = query.lte('total_abonado', maxAbonado);
        const { data, error } = await query;
        if (error) throw error;
        if (data) allBoletas.push(...data);
      }

      const porCliente = {};
      for (const b of allBoletas) {
        const tel = b.telefono_cliente;
        if (!porCliente[tel]) {
          const cd = phoneMap[tel] || {};
          porCliente[tel] = {
            telefono: cd.fullPhone || `+57${tel}`,
            nombre: b.clientes?.nombre || cd.chateaName || 'Sin nombre',
            apellido: b.clientes?.apellido || '',
            boletas: [],
            totalSaldo: 0,
            ultimoAbono: null
          };
        }
        porCliente[tel].boletas.push(b.numero);
        porCliente[tel].totalSaldo += Number(b.saldo_restante);
      }

      if (fechaCorte) {
        const allNumeroBoletas = allBoletas.map(b => b.numero);
        let allAbonos = [];
        for (let i = 0; i < allNumeroBoletas.length; i += batchSize) {
          const batch = allNumeroBoletas.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from('abonos')
            .select('numero_boleta, fecha_pago')
            .in('numero_boleta', batch)
            .order('fecha_pago', { ascending: false });
          if (error) throw error;
          if (data) allAbonos.push(...data);
        }

        const ultimoAbonoPorBoleta = {};
        for (const a of allAbonos) {
          if (!ultimoAbonoPorBoleta[a.numero_boleta] || a.fecha_pago > ultimoAbonoPorBoleta[a.numero_boleta]) {
            ultimoAbonoPorBoleta[a.numero_boleta] = a.fecha_pago;
          }
        }

        for (const c of Object.values(porCliente)) {
          let maxFecha = null;
          for (const num of c.boletas) {
            const fecha = ultimoAbonoPorBoleta[num];
            if (fecha && (!maxFecha || fecha > maxFecha)) maxFecha = fecha;
          }
          c.ultimoAbono = maxFecha;
        }

        for (const tel of Object.keys(porCliente)) {
          const c = porCliente[tel];
          if (c.ultimoAbono && c.ultimoAbono >= fechaCorte) {
            delete porCliente[tel];
          }
        }
      }

      const clientes = Object.values(porCliente).sort((a, b) => b.totalSaldo - a.totalSaldo);
      const totalSaldo = clientes.reduce((s, c) => s + c.totalSaldo, 0);

      return res.json({
        status: 'ok',
        total_chateapro: withPhone.length,
        total_con_deuda: clientes.length,
        total_sin_boleta: withPhone.length - Object.keys(porCliente).length,
        total_saldo: totalSaldo,
        clientes
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: 'Error al buscar clientes: ' + error.message });
    }
  }

  // ── STATS: Estadísticas de éxito/fallo por difusión ──
  if (accion === 'stats') {
    try {
      const [tags1, tags2] = await Promise.all([
        fetchTagsPaginated(TOKEN_L1),
        fetchTagsPaginated(TOKEN_L2)
      ]);

      const allTags = [
        ...tags1.map(t => ({ ...t, linea: 1, token: TOKEN_L1 })),
        ...tags2.map(t => ({ ...t, linea: 2, token: TOKEN_L2 }))
      ];

      const isFallo = (name) => {
        const lower = name.toLowerCase();
        return lower.includes('falló') || lower.includes('fallo');
      };

      const getBaseName = (name) => {
        return name
          .replace(/\s*[-–]\s*fallo\s*$/i, '')
          .replace(/\s*falló\s*$/i, '')
          .replace(/\s*FALLÓ\s*$/i, '')
          .replace(/\s*fallo\s*$/i, '')
          .trim();
      };

      const falloTags = allTags.filter(t => isFallo(t.name));
      const exitoTags = allTags.filter(t => !isFallo(t.name));

      const exitoMap = {};
      for (const t of exitoTags) {
        const key = t.name.trim();
        if (!exitoMap[key]) exitoMap[key] = [];
        exitoMap[key].push(t);
      }

      async function fetchTagCount(token, tagNs) {
        try {
          const resp = await fetch(`https://chateapro.app/api/subscribers?tag_ns=${tagNs}&limit=1&page=1`, {
            headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
          }).then(r => r.json());
          return resp.meta?.total || resp.data?.length || 0;
        } catch { return 0; }
      }

      const pares = {};
      for (const ft of falloTags) {
        const base = getBaseName(ft.name);
        if (!pares[base]) pares[base] = { nombre: base, exitoTags: [], falloTags: [] };
        pares[base].falloTags.push(ft);
      }

      for (const base of Object.keys(pares)) {
        if (exitoMap[base]) {
          pares[base].exitoTags = exitoMap[base];
        }
      }

      const countPromises = [];
      const countKeys = [];
      for (const base of Object.keys(pares)) {
        for (const t of pares[base].exitoTags) {
          countKeys.push({ base, tipo: 'exito', tag_ns: t.tag_ns });
          countPromises.push(fetchTagCount(t.token, t.tag_ns));
        }
        for (const t of pares[base].falloTags) {
          countKeys.push({ base, tipo: 'fallo', tag_ns: t.tag_ns });
          countPromises.push(fetchTagCount(t.token, t.tag_ns));
        }
      }

      const counts = await Promise.all(countPromises);

      for (let i = 0; i < countKeys.length; i++) {
        const { base, tipo } = countKeys[i];
        if (!pares[base].totalExito) pares[base].totalExito = 0;
        if (!pares[base].totalFallo) pares[base].totalFallo = 0;
        if (tipo === 'exito') pares[base].totalExito += counts[i];
        else pares[base].totalFallo += counts[i];
      }

      const resultado = Object.values(pares).map(p => ({
        difusion: p.nombre,
        enviados: (p.totalExito || 0) + (p.totalFallo || 0),
        exitosos: p.totalExito || 0,
        fallidos: p.totalFallo || 0,
        pct_fallo: (p.totalExito || 0) + (p.totalFallo || 0) > 0
          ? Math.round(((p.totalFallo || 0) / ((p.totalExito || 0) + (p.totalFallo || 0))) * 100)
          : 0
      })).filter(r => r.enviados > 0).sort((a, b) => b.pct_fallo - a.pct_fallo);

      const totalEnviados = resultado.reduce((s, r) => s + r.enviados, 0);
      const totalFallidos = resultado.reduce((s, r) => s + r.fallidos, 0);

      return res.json({
        status: 'ok',
        difusiones: resultado,
        resumen: {
          total_difusiones: resultado.length,
          total_enviados: totalEnviados,
          total_fallidos: totalFallidos,
          pct_fallo_global: totalEnviados > 0 ? Math.round((totalFallidos / totalEnviados) * 100) : 0
        }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: 'Error al obtener estadísticas: ' + error.message });
    }
  }

  // ── FUNNEL: Conteo de suscriptores por etapa del embudo de ventas ──
  if (accion === 'funnel') {
    try {
      const [tags1, tags2] = await Promise.all([
        fetchTagsPaginated(TOKEN_L1),
        fetchTagsPaginated(TOKEN_L2)
      ]);

      const ETAPAS = [
        { key: 'ViewContent', label: 'Vieron la info', emoji: '👀' },
        { key: 'LeadSubmitted', label: 'Enviaron datos', emoji: '📝' },
        { key: 'QualifiedLead', label: 'Lead calificado', emoji: '✅' },
        { key: 'AddToCart', label: 'Separaron boleta', emoji: '🛒' },
        { key: 'InitiateCheckout', label: 'Iniciaron pago', emoji: '💳' },
        { key: 'Purchase', label: 'Pagaron', emoji: '💰' }
      ];

      const allTags = [
        ...tags1.map(t => ({ ...t, token: TOKEN_L1 })),
        ...tags2.map(t => ({ ...t, token: TOKEN_L2 }))
      ];

      async function fetchTagCount(token, tagNs) {
        try {
          const resp = await fetch(`https://chateapro.app/api/subscribers?tag_ns=${tagNs}&limit=1&page=1`, {
            headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
          }).then(r => r.json());
          return resp.meta?.total || 0;
        } catch { return 0; }
      }

      const countPromises = [];
      const countKeys = [];

      for (const etapa of ETAPAS) {
        const matchingTags = allTags.filter(t => t.name.includes(etapa.key));
        for (const t of matchingTags) {
          countKeys.push({ key: etapa.key });
          countPromises.push(fetchTagCount(t.token, t.tag_ns));
        }
      }

      const counts = await Promise.all(countPromises);

      const totalesPorEtapa = {};
      for (let i = 0; i < countKeys.length; i++) {
        const { key } = countKeys[i];
        totalesPorEtapa[key] = (totalesPorEtapa[key] || 0) + counts[i];
      }

      const etapasResult = ETAPAS.map((e, idx) => {
        const total = totalesPorEtapa[e.key] || 0;
        const anterior = idx > 0 ? (totalesPorEtapa[ETAPAS[idx - 1].key] || 0) : total;
        return {
          key: e.key,
          label: e.label,
          emoji: e.emoji,
          total,
          conversion_desde_anterior: anterior > 0 ? Math.round((total / anterior) * 100) : 0,
          conversion_desde_inicio: (totalesPorEtapa[ETAPAS[0].key] || 0) > 0
            ? Math.round((total / (totalesPorEtapa[ETAPAS[0].key] || 1)) * 100)
            : 0
        };
      });

      return res.json({ status: 'ok', etapas: etapasResult });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: 'Error al obtener embudo: ' + error.message });
    }
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida. Usa: tags, preview, stats, funnel' });
}
