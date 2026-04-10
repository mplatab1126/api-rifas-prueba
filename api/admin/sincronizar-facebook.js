import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const cuentas = [
    { id: process.env.FB_ACT_1_ID, token: process.env.FB_ACT_1_TOKEN, nombre: 'Facebook de Mateo' },
    { id: process.env.FB_ACT_2_ID, token: process.env.FB_ACT_2_TOKEN, nombre: 'Facebook de Alejandro' }
  ].filter(c => c.id && c.token);

  if(cuentas.length === 0) return res.status(200).json({status: 'error', mensaje: 'Faltan las llaves de Facebook en Vercel'});

  try {
    let registrosTotales = [];
    let erroresFB = []; 

    // Calculamos el rango de fechas en hora Colombia (UTC-5)
    const offset = -5; 
    const hoy = new Date(new Date().getTime() + offset * 3600 * 1000);
    
    // Desde el 1 de enero del año actual hasta hoy
    const since = `${hoy.getUTCFullYear()}-01-01`;
    const until = hoy.toISOString().split('T')[0];
    const timeRange = JSON.stringify({ since, until });

    const procesarItem = (item, idLimpio, nombreCuenta) => {
      let conversaciones = 0;
      let compras = 0;
      if (item.actions) {
        const actConv = item.actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
        if (actConv) conversaciones = parseInt(actConv.value);
        const actCompra = item.actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
        if (actCompra) compras = parseInt(actCompra.value);
      }
      const gasto = parseFloat(item.spend) || 0;
      return {
        fecha: item.date_start,
        cuenta_id: idLimpio,
        nombre_cuenta: nombreCuenta,
        campana_id: item.campaign_id || '000',
        nombre_campana: item.campaign_name || 'Desconocida',
        adset_id: item.adset_id || '000',
        nombre_adset: item.adset_name || 'Desconocido',
        ad_id: item.ad_id || '000',
        nombre_ad: item.ad_name || 'Desconocido',
        gasto: Math.round(gasto),
        alcance: parseInt(item.reach) || 0,
        impresiones: parseInt(item.impressions) || 0,
        frecuencia: parseFloat(item.frequency) || 0,
        cpm: parseFloat(item.cpm) || 0,
        clics_enlace: parseInt(item.inline_link_clicks) || 0,
        cpc: parseFloat(item.cpc) || 0,
        ctr: parseFloat(item.inline_link_click_ctr) || 0,
        conversaciones,
        costo_conversacion: conversaciones > 0 ? Math.round(gasto / conversaciones) : 0,
        compras,
        costo_compra: compras > 0 ? Math.round(gasto / compras) : 0
      };
    };

    for (const cuenta of cuentas) {
      const idLimpio = cuenta.id.replace(/\D/g, '');

      // limit=500 maximiza resultados por página; seguimos paginando hasta que no haya más
      let urlActual = `https://graph.facebook.com/v19.0/act_${idLimpio}/insights?level=ad&limit=500&time_range=${encodeURIComponent(timeRange)}&time_increment=1&fields=date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,reach,impressions,frequency,cpm,inline_link_clicks,cpc,inline_link_click_ctr,actions&access_token=${cuenta.token.trim()}`;

      let paginas = 0;
      while (urlActual) {
        paginas++;
        const fbReq = await fetch(urlActual);
        const fbRes = await fbReq.json();

        if (fbRes.error) {
          erroresFB.push(`❌ ${cuenta.nombre} (pág ${paginas}): ${fbRes.error.message}`);
          break;
        }

        if (fbRes.data && fbRes.data.length > 0) {
          for (const item of fbRes.data) {
            registrosTotales.push(procesarItem(item, idLimpio, cuenta.nombre));
          }
        }

        // Seguir a la siguiente página si existe
        urlActual = fbRes.paging?.next || null;
      }
    }

    if (registrosTotales.length === 0) {
       if (erroresFB.length > 0) {
           return res.status(200).json({ status: 'error', mensaje: 'Facebook rechazó la conexión:\n\n' + erroresFB.join('\n\n') });
       }
       return res.status(200).json({ status: 'ok', mensaje: 'Las cuentas están conectadas, pero no hubo gasto en estas fechas.' });
    }

    const { error } = await supabase
      .from('metricas_facebook')
      .upsert(registrosTotales, { onConflict: 'fecha, cuenta_id, campana_id, adset_id, ad_id' });

    if (error) throw error;

    let mensajeFinal = `¡Meta Sincronizado! Se extrajeron ${registrosTotales.length} registros de anuncios (${since} → ${until}).`;
    if (erroresFB.length > 0) {
        mensajeFinal += `\n\n⚠️ OJO, falló una cuenta:\n` + erroresFB.join('\n');
    }

    return res.status(200).json({ status: 'ok', mensaje: mensajeFinal });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Fallo al procesar: ' + error.message });
  }
}
