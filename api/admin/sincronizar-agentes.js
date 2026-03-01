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
  
  // 🌟 AQUÍ DEBES PEGAR TUS DOS TOKENS LARGOS 🌟
  const CHATEA_TOKEN_LINEA_1 = "B5SUQW1ZFq6DcEFd7ePPdfk7kRffZVKUt6rCLlxgL9R4CTcrsQ5epphoKfB1";
  const CHATEA_TOKEN_LINEA_2 = "EUdxRa1afPfoUYf7ok9b36xga3XF0hdpnABkpJ4pr78jb61gM3OsfhIuinQp";

  try {
    // 1. Llamamos a AMBAS líneas de Chatea Pro al mismo tiempo
    const [respuesta1, respuesta2] = await Promise.all([
      fetch('https://chateapro.app/api/flow-agent-summary?range=last_7_days', {
        headers: { 'accept': 'application/json', 'Authorization': `Bearer ${CHATEA_TOKEN_LINEA_1}` }
      }).then(r => r.json()),
      fetch('https://chateapro.app/api/flow-agent-summary?range=last_7_days', {
        headers: { 'accept': 'application/json', 'Authorization': `Bearer ${CHATEA_TOKEN_LINEA_2}` }
      }).then(r => r.json())
    ]);

    const dataLinea1 = respuesta1.data || [];
    const dataLinea2 = respuesta2.data || [];
    
    // Unimos los resultados de las dos líneas en una sola lista gigante
    const todosLosDatos = [...dataLinea1, ...dataLinea2];

    if (todosLosDatos.length === 0) {
      return res.status(200).json({ status: 'ok', mensaje: 'No hay datos nuevos en ninguna línea para sincronizar.' });
    }

    // 2. Agrupamos y SUMAMOS los datos (Por si un asesor atiende las dos líneas el mismo día)
    const mapaRegistros = {};

    todosLosDatos.forEach(item => {
      const fecha = item.summary_date;
      const asesor = item.agent.name;
      const clave = `${fecha}_${asesor}`; // Ejemplo: "2026-02-28_Luisa Arias"

      if (!mapaRegistros[clave]) {
        mapaRegistros[clave] = {
          fecha: fecha,
          asesor: asesor,
          mensajes_enviados: 0,
          conversaciones_asignadas: 0,
          conversaciones_cerradas: 0,
          tiempo_respuesta_segundos: 0,
          _cantidad_tiempos: 0 // Usado internamente para promediar el tiempo
        };
      }

      // Sumamos los mensajes y chats de ambas líneas
      mapaRegistros[clave].mensajes_enviados += (item.day_agent_messages || 0);
      mapaRegistros[clave].conversaciones_asignadas += (item.day_assigned || 0);
      mapaRegistros[clave].conversaciones_cerradas += (item.day_done || 0);
      
      if (item.avg_agent_response_time > 0) {
        mapaRegistros[clave].tiempo_respuesta_segundos += item.avg_agent_response_time;
        mapaRegistros[clave]._cantidad_tiempos += 1;
      }
    });

    // 3. Formateamos y calculamos promedios para Supabase
    const registros = Object.values(mapaRegistros).map(reg => {
      // Si el asesor estuvo en las 2 líneas, promediamos su tiempo de respuesta general
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

    // 4. Guardamos la fusión perfecta en Supabase
    const { error } = await supabase
      .from('rendimiento_asesores')
      .upsert(registros, { onConflict: 'fecha, asesor' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: `¡Líneas 1 y 2 sincronizadas con éxito! Se sumaron y actualizaron ${registros.length} registros.` });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error al sincronizar: ' + error.message });
  }
}
