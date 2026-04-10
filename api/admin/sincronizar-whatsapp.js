import { supabase } from '../lib/supabase.js';

/**
 * Sincroniza los costos de plantillas de WhatsApp Business
 * desde la Meta WABA Conversation Analytics API.
 *
 * Variables de entorno necesarias:
 *   WABA_ID    — ID de tu WhatsApp Business Account (ej: 123456789)
 *   WABA_TOKEN — System User Token con permiso whatsapp_business_management
 *
 * Tabla Supabase requerida (ejecutar en SQL Editor):
 *   CREATE TABLE costos_whatsapp (
 *     id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     fecha              DATE NOT NULL,
 *     tipo_conversacion  TEXT DEFAULT 'marketing',
 *     cantidad_mensajes  INTEGER DEFAULT 0,
 *     costo              NUMERIC(14,0) NOT NULL DEFAULT 0,
 *     descripcion        TEXT,
 *     fuente             TEXT DEFAULT 'manual',
 *     created_at         TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE UNIQUE INDEX costos_whatsapp_fecha_tipo_idx ON costos_whatsapp (fecha, tipo_conversacion);
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor || nombreAsesor !== 'Mateo') {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }

  const wabaId    = process.env.WABA_ID;
  const wabaToken = process.env.WABA_TOKEN;

  if (!wabaId || !wabaToken) {
    return res.status(200).json({
      status: 'error',
      mensaje: 'Faltan las variables WABA_ID y WABA_TOKEN en Vercel. Configúralas para activar la sincronización automática.'
    });
  }

  try {
    const tokenLimpio = wabaToken.trim();

    // ── PASO 1: Verificar qué cuenta está conectada realmente ───────────────
    const verificarUrl = `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,currency,message_template_namespace&access_token=${tokenLimpio}`;
    const verificarRes  = await fetch(verificarUrl);
    const verificarData = await verificarRes.json();

    if (verificarData.error) {
      return res.status(200).json({
        status: 'error',
        mensaje: `❌ Token o WABA_ID incorrecto: ${verificarData.error.message}`,
        diagnostico: { waba_id_configurado: wabaId, error_meta: verificarData.error }
      });
    }

    const nombreCuenta = verificarData.name || wabaId;

    // ── PASO 2: Obtener Phone Number IDs asociados al WABA ──────────────────
    const phoneUrl  = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${tokenLimpio}`;
    const phoneRes  = await fetch(phoneUrl);
    const phoneData = await phoneRes.json();
    const numeros   = phoneData?.data || [];

    // ── PASO 3: Conversation analytics ─────────────────────────────────────
    const offset = -5;
    const hoy = new Date(new Date().getTime() + offset * 3600 * 1000);
    const inicioRifa = new Date('2026-01-26T00:00:00Z');
    const startTs = Math.floor(inicioRifa.getTime() / 1000);
    const endTs   = Math.floor(hoy.getTime() / 1000);

    // Función auxiliar: consulta conversation_analytics para un ID dado
    async function fetchAnalytics(id) {
      const u = new URL(`https://graph.facebook.com/v21.0/${id}/conversation_analytics`);
      u.searchParams.set('start',        String(startTs));
      u.searchParams.set('end',          String(endTs));
      u.searchParams.set('granularity',  'DAILY');
      u.searchParams.set('metric_types', 'COST,CONVERSATION');
      u.searchParams.set('breakdown_by', JSON.stringify(['CONVERSATION_CATEGORY', 'CONVERSATION_DIRECTION']));
      u.searchParams.set('access_token', tokenLimpio);
      const r = await fetch(u.toString());
      return r.json();
    }

    // Intentar primero con el WABA ID, luego con cada Phone Number ID
    const idsAProbar = [wabaId, ...numeros.map(n => n.id)];
    let apiData = null;
    let idUsado = null;

    for (const id of idsAProbar) {
      const resultado = await fetchAnalytics(id);
      if (!resultado.error) {
        const raw = resultado?.data;
        const pts = Array.isArray(raw) ? raw.flatMap(d => d.data_points || []) : (raw?.data_points || []);
        if (pts.length > 0) { apiData = resultado; idUsado = id; break; }
        if (!apiData) { apiData = resultado; idUsado = id; } // guardar aunque sea vacío
      }
    }

    if (apiData?.error) {
      return res.status(200).json({
        status: 'error',
        mensaje: `Meta API (analytics): ${apiData.error.message} (código ${apiData.error.code})`,
        diagnostico: { cuenta: nombreCuenta, waba_id: wabaId }
      });
    }

    // ── PASO 4: Extraer data_points ─────────────────────────────────────────
    const rawData = apiData?.data;
    let dataPoints = [];
    if (Array.isArray(rawData)) {
      dataPoints = rawData.flatMap(d => d.data_points || []);
    } else if (rawData?.data_points) {
      dataPoints = rawData.data_points;
    } else if (Array.isArray(apiData?.data_points)) {
      dataPoints = apiData.data_points;
    }

    if (dataPoints.length === 0) {
      const telefonos = numeros.map(n => `${n.verified_name} (${n.display_phone_number}) [ID: ${n.id}]`).join(' | ') || 'No encontrados';
      return res.status(200).json({
        status: 'sin_datos',
        mensaje: `La cuenta "${nombreCuenta}" está bien configurada, pero Meta no tiene datos de conversación disponibles en su API para este período. Esto ocurre cuando los costos aún no fueron procesados (puede tardar 48h) o cuando la cuenta usa facturación por prepago sin reporte por conversación. Registra los costos manualmente con los montos de "Actividad de pago" en Meta.`,
        diagnostico: {
          waba_id:    wabaId,
          cuenta:     nombreCuenta,
          telefonos,
          ids_probados: idsAProbar.join(', '),
          periodo: {
            desde: new Date(startTs * 1000).toISOString().split('T')[0],
            hasta: new Date(endTs   * 1000).toISOString().split('T')[0]
          }
        }
      });
    }

    const registros = [];
    const tasaCambio = Number(process.env.TASA_CAMBIO_USD_COP) || 4300;

    for (const point of dataPoints) {
      const fecha = new Date((point.start ?? point.startTime ?? 0) * 1000).toISOString().split('T')[0];

      const costoUsd       = Number(point.cost ?? point.cost_in_local_currency ?? 0);
      const conversaciones = Number(point.conversation ?? point.conversations ?? 0);
      // La API v21 usa conversation_category; versiones antiguas usaban conversation_type
      const tipo = point.conversation_category ?? point.conversation_type ?? 'general';

      if (costoUsd <= 0 && conversaciones === 0) continue;

      const costoCop = Math.round(costoUsd * tasaCambio);

      registros.push({
        fecha,
        tipo_conversacion:  tipo.toLowerCase(),
        cantidad_mensajes:  conversaciones,
        costo:              costoCop,
        descripcion:        `WhatsApp ${tipo} · ${conversaciones} conv · $${costoUsd.toFixed(4)} USD`,
        fuente:             'meta_api'
      });
    }

    if (registros.length === 0) {
      return res.status(200).json({
        status: 'sin_datos',
        mensaje: `Se encontraron ${dataPoints.length} puntos de datos pero todos tienen costo $0 y 0 conversaciones. Puede que el período no tenga actividad facturada aún.`,
        diagnostico: {
          total_puntos: dataPoints.length,
          muestra: JSON.stringify(dataPoints.slice(0, 3)).substring(0, 400)
        }
      });
    }

    // Upsert por (fecha, tipo_conversacion)
    const { error } = await supabase
      .from('costos_whatsapp')
      .upsert(registros, { onConflict: 'fecha,tipo_conversacion' });

    if (error) throw error;

    const totalCop = registros.reduce((s, r) => s + r.costo, 0);
    return res.status(200).json({
      status: 'ok',
      mensaje: `✅ WhatsApp sincronizado. ${registros.length} registros importados. Total: $${totalCop.toLocaleString('es-CO')} COP`
    });

  } catch (err) {
    return res.status(500).json({ status: 'error', mensaje: 'Error al sincronizar WhatsApp: ' + err.message });
  }
}
