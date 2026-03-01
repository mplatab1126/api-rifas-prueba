import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos CORS para conectar con tu panel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // 2. Traemos tus llaves seguras de Vercel
  const cuentas = [
    { id: process.env.FB_ACT_1_ID, token: process.env.FB_ACT_1_TOKEN, nombre: 'Cuenta Principal' },
    { id: process.env.FB_ACT_2_ID, token: process.env.FB_ACT_2_TOKEN, nombre: 'Cuenta Secundaria' }
  ].filter(c => c.id && c.token); // Filtra por si falta alguna llave

  if(cuentas.length === 0) return res.status(500).json({status: 'error', mensaje: 'Faltan las llaves de Facebook en Vercel'});

  try {
    let registrosTotales = [];

    // 3. El ciclo mágico: Facebook nos manda los datos de los últimos 7 días
    for (const cuenta of cuentas) {
      // Le pedimos a Facebook TODAS tus métricas a nivel Anuncio (Ad)
      const url = `https://graph.facebook.com/v19.0/act_${cuenta.id}/insights?level=ad&date_preset=last_7_days&fields=date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,frequency,cpm,inline_link_clicks,cpc,inline_link_click_ctr,actions&access_token=${cuenta.token}`;

      const fbReq = await fetch(url);
      const fbRes = await fbReq.json();

      if (fbRes.error) {
        console.error("Error en cuenta " + cuenta.nombre + ":", fbRes.error);
        continue; // Si falla una cuenta, no detiene el proceso de la otra
      }

      if (fbRes.data && fbRes.data.length > 0) {
        for (const item of fbRes.data) {
          
          let conversaciones = 0;
          let compras = 0;

          // Extraemos los eventos de tu embudo directamente de Facebook
          if (item.actions) {
            const actConv = item.actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
            if (actConv) conversaciones = parseInt(actConv.value);

            const actCompra = item.actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
            if (actCompra) compras = parseInt(actCompra.value);
          }

          const gasto = parseFloat(item.spend) || 0;
          // Matemáticas para costos
          const costo_conv = conversaciones > 0 ? (gasto / conversaciones) : 0;
          const costo_comp = compras > 0 ? (gasto / compras) : 0;

          registrosTotales.push({
            fecha: item.date_start,
            cuenta_id: cuenta.id,
            nombre_cuenta: cuenta.nombre,
            campana_id: item.campaign_id,
            nombre_campana: item.campaign_name,
            adset_id: item.adset_id,
            nombre_adset: item.adset_name,
            ad_id: item.ad_id,
            nombre_ad: item.ad_name,
            gasto: Math.round(gasto), // Redondeamos para no tener 10 decimales
            alcance: parseInt(item.reach) || 0,
            impresiones: parseInt(item.impressions) || 0,
            frecuencia: parseFloat(item.frequency) || 0,
            cpm: parseFloat(item.cpm) || 0,
            clics_enlace: parseInt(item.inline_link_clicks) || 0,
            cpc: parseFloat(item.cpc) || 0,
            ctr: parseFloat(item.inline_link_click_ctr) || 0,
            conversaciones: conversaciones,
            costo_conversacion: Math.round(costo_conv),
            compras: compras,
            costo_compra: Math.round(costo_comp)
          });
        }
      }
    }

    if (registrosTotales.length === 0) {
       return res.status(200).json({ status: 'ok', mensaje: 'Las cuentas están conectadas, pero no hubo gasto en los últimos 7 días.' });
    }

    // 4. Inyectamos la información a Supabase (reemplazando lo viejo del día si ya existía)
    const { error } = await supabase
      .from('metricas_facebook')
      .upsert(registrosTotales, { onConflict: 'fecha, cuenta_id, campana_id, adset_id, ad_id' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: `¡Meta Sincronizado! Se extrajeron ${registrosTotales.length} bloques de anuncios activos.` });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Fallo al procesar: ' + error.message });
  }
}
