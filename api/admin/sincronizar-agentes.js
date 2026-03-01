import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  
  // TUS TOKENS ACTUALES
  const CHATEA_TOKEN_LINEA_1 = "B5SUQW1ZFq6DcEFd7ePPdfk7kRffZVKUt6rCLlxgL9R4CTcrsQ5epphoKfB1";
  const CHATEA_TOKEN_LINEA_2 = "EUdxRa1afPfoUYf7ok9b36xga3XF0hdpnABkpJ4pr78jb61gM3OsfhIuinQp";

  try {
    const respuesta1 = await fetch('https://chateapro.app/api/flow-agent-summary?range=last_7_days', {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${CHATEA_TOKEN_LINEA_1}` }
    }).then(r => r.json());

    const respuesta2 = await fetch('https://chateapro.app/api/flow-agent-summary?range=last_7_days', {
      headers: { 'accept': 'application/json', 'Authorization': `Bearer ${CHATEA_TOKEN_LINEA_2}` }
    }).then(r => r.json());

    // 🚨 EL DETECTOR DE ERRORES (NUEVO) 🚨
    if (!respuesta1.data) {
        return res.status(200).json({ status: 'error', mensaje: 'Fallo en Línea 1. Chatea Pro dice: ' + JSON.stringify(respuesta1) });
    }
    if (!respuesta2.data) {
        return res.status(200).json({ status: 'error', mensaje: 'Fallo en Línea 2. Chatea Pro dice: ' + JSON.stringify(respuesta2) });
    }

    const todosLosDatos = [...respuesta1.data, ...respuesta2.data];

    if (todosLosDatos.length === 0) {
      return res.status(200).json({ status: 'ok', mensaje: 'No hay datos nuevos en ninguna línea para sincronizar.' });
    }

    const mapaRegistros = {};

    todosLosDatos.forEach(item => {
      const fecha = item.summary_date;
      const asesor = item.agent.name;
      const clave = `${fecha}_${asesor}`; 

      if (!mapaRegistros[clave]) {
        mapaRegistros[clave] = {
          fecha: fecha,
          asesor: asesor,
          mensajes_enviados: 0,
          conversaciones_asignadas: 0,
          conversaciones_cerradas: 0,
          tiempo_respuesta_segundos: 0,
          _cantidad_tiempos: 0 
        };
      }

      mapaRegistros[clave].mensajes_enviados += (item.day_agent_messages || 0);
      mapaRegistros[clave].conversaciones_asignadas += (item.day_assigned || 0);
      mapaRegistros[clave].conversaciones_cerradas += (item.day_done || 0);
      
      if (item.avg_agent_response_time > 0) {
        mapaRegistros[clave].tiempo_respuesta_segundos += item.avg_agent_response_time;
        mapaRegistros[clave]._cantidad_tiempos += 1;
      }
    });

    const registros = Object.values(mapaRegistros).map(reg => {
      let tiempoFinal = reg._cantidad_tiempos > 0 ? (reg.tiempo_respuesta_segundos / reg._cantidad_tiempos) : 0;
      return {
        fecha: reg.fecha,
        asesor: reg.asesor,
        mensajes_enviados: reg.mensajes_enviados,
        conversaciones_asignadas: reg.conversaciones_asignadas,
        conversaciones_cerradas: reg.conversaciones_cerradas,
        tiempo_respuesta_segundos: tiempoFinal
      };
    });

    const { error } = await supabase
      .from('rendimiento_asesores')
      .upsert(registros, { onConflict: 'fecha, asesor' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: `¡Líneas 1 y 2 sincronizadas con éxito! Se sumaron y actualizaron ${registros.length} registros.` });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error al sincronizar: ' + error.message });
  }
}
