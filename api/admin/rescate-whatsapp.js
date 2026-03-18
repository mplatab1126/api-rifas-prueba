import { createClient } from '@supabase/supabase-js';

const GERENCIA = ['Mateo', 'Alejo P', 'Alejo Plata'];

async function fetchTagsPaginated(token) {
  const tags = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const resp = await fetch(`https://chateapro.app/api/flow/tags?limit=50&page=${page}`, {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (resp.data) tags.push(...resp.data);
    hasMore = resp.meta && page < resp.meta.last_page;
    page++;
  }
  return tags;
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
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { contrasena, accion, ...payload } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!GERENCIA.includes(nombreAsesor)) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede usar esta función.' });

  const TOKEN_L1 = process.env.CHATEA_TOKEN_LINEA_1;
  const TOKEN_L2 = process.env.CHATEA_TOKEN_LINEA_2;

  // ── TAGS: Lista los tags que contienen "falló" o "fallo" ──
  if (accion === 'tags') {
    try {
      const [tags1, tags2] = await Promise.all([
        fetchTagsPaginated(TOKEN_L1),
        fetchTagsPaginated(TOKEN_L2)
      ]);

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

      return res.json({ status: 'ok', tags: falloTags });
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
        if (!phoneMap[last10]) {
          phoneMap[last10] = {
            fullPhone: `+${digits}`,
            chateaName: s.name || s.first_name || 'Sin nombre',
            user_ns: s.user_ns
          };
        }
      }

      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      const last10List = Object.keys(phoneMap);

      let allBoletas = [];
      const batchSize = 100;
      for (let i = 0; i < last10List.length; i += batchSize) {
        const batch = last10List.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('boletas')
          .select('numero, saldo_restante, total_abonado, telefono_cliente, clientes(nombre, apellido)')
          .in('telefono_cliente', batch)
          .gt('saldo_restante', 0);
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
            totalSaldo: 0
          };
        }
        porCliente[tel].boletas.push(b.numero);
        porCliente[tel].totalSaldo += Number(b.saldo_restante);
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

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida. Usa: tags, preview' });
}
