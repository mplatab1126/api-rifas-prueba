import { createClient } from '@supabase/supabase-js';

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

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Rango: desde el 1 de enero del año actual hasta hoy (hora Colombia)
    const offset = -5;
    const hoy = new Date(new Date().getTime() + offset * 3600 * 1000);
    const inicioAnio = new Date(hoy.getUTCFullYear(), 0, 1);

    // La API requiere timestamps Unix en segundos
    const startTs = Math.floor(inicioAnio.getTime() / 1000);
    const endTs   = Math.floor(hoy.getTime()       / 1000);

    // Tipos de conversación que factura WhatsApp Business
    const tiposConversacion = ['marketing', 'utility', 'authentication', 'service'];

    const url = new URL(`https://graph.facebook.com/v19.0/${wabaId}/conversation_analytics`);
    url.searchParams.set('start',       startTs);
    url.searchParams.set('end',         endTs);
    url.searchParams.set('granularity', 'DAILY');
    // Valores válidos: UNKNOWN, CONVERSATION, COST  (SENT no existe en esta API)
    url.searchParams.set('metric_types', JSON.stringify(['COST', 'CONVERSATION']));
    url.searchParams.set('access_token', wabaToken.trim());

    const apiRes  = await fetch(url.toString());
    const apiData = await apiRes.json();

    if (apiData.error) {
      return res.status(200).json({
        status: 'error',
        mensaje: `Meta API: ${apiData.error.message} (código ${apiData.error.code})`
      });
    }

    // La respuesta puede venir como apiData.data (array) o apiData.data.data_points
    const rawData   = apiData?.data;
    const dataPoints = Array.isArray(rawData)
      ? rawData.flatMap(d => d.data_points || [])
      : (rawData?.data_points || []);

    const registros = [];

    for (const point of dataPoints) {
      const fecha = new Date(point.start * 1000).toISOString().split('T')[0];

      const costoUsd       = Number(point.cost)         || 0;
      const conversaciones = Number(point.conversation) || 0;
      const tipo           = point.conversation_type    || 'general';

      if (costoUsd <= 0 && conversaciones === 0) continue;

      const tasaCambio = Number(process.env.TASA_CAMBIO_USD_COP) || 4300;
      const costoCop   = Math.round(costoUsd * tasaCambio);

      registros.push({
        fecha,
        tipo_conversacion:  tipo,
        cantidad_mensajes:  conversaciones,
        costo:              costoCop,
        descripcion:        `WhatsApp ${tipo} · ${conversaciones} conversaciones · $${costoUsd.toFixed(4)} USD`,
        fuente:             'meta_api'
      });
    }

    if (registros.length === 0) {
      return res.status(200).json({
        status: 'ok',
        mensaje: 'La cuenta de WhatsApp está conectada, pero no se encontraron costos en este período.'
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
