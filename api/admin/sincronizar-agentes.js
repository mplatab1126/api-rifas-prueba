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
  
  // AQUÍ DEBES PEGAR EL TOKEN LARGO QUE CREASTE EN CHATEA PRO
  const CHATEA_PRO_TOKEN = "B5SUQW1ZFq6DcEFd7ePPdfk7kRffZVKUt6rCLlxgL9R4CTcrsQ5epphoKfB1";

  try {
    // 1. Llamamos a Chatea Pro pidiendo los datos de los últimos 7 días
    const respuestaChatea = await fetch('https://chateapro.app/api/flow-agent-summary?range=last_7_days', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${CHATEA_PRO_TOKEN}`
      }
    });

    const dataChatea = await respuestaChatea.json();

    if (!dataChatea.data || dataChatea.data.length === 0) {
      return res.status(200).json({ status: 'ok', mensaje: 'No hay datos nuevos en Chatea Pro para sincronizar.' });
    }

    // 2. Preparamos los datos para Supabase
    let registros = dataChatea.data.map(item => ({
      fecha: item.summary_date,
      asesor: item.agent.name,
      mensajes_enviados: item.day_agent_messages || 0,
      conversaciones_asignadas: item.day_assigned || 0,
      conversaciones_cerradas: item.day_done || 0,
      tiempo_respuesta_segundos: item.avg_agent_response_time || 0
    }));

    // 3. Guardamos en Supabase (Si ya existe ese día, lo actualiza)
    const { error } = await supabase
      .from('rendimiento_asesores')
      .upsert(registros, { onConflict: 'fecha, asesor' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: `¡Sincronización exitosa! Se actualizaron las estadísticas de ${registros.length} registros.` });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error al sincronizar: ' + error.message });
  }
}
