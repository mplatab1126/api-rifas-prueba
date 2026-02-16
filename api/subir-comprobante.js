import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const textoIA = req.body?.texto_ia || req.query?.texto_ia;

  if (!textoIA || textoIA.includes('ERROR')) {
    return res.status(400).json({ error: 'La IA no pudo leer el comprobante o el texto es inválido.' });
  }

  try {
    const platformMatch = textoIA.match(/Plataforma:\s*([^,]+)/i);
    const montoMatch = textoIA.match(/Monto:\s*(\d+)/i);
    const refMatch = textoIA.match(/Referencia:\s*([^,]+)/i);
    const dateMatch = textoIA.match(/Fecha:\s*([\d\/]+)/i);
    const timeMatch = textoIA.match(/Hora:\s*([^,]+)/i); // 🌟 NUEVO: Extraemos la hora

    if (!platformMatch || !montoMatch || !refMatch || !dateMatch) {
        return res.status(400).json({ error: 'Faltan datos clave en la lectura de la IA.' });
    }

    const plataforma = platformMatch[1].trim();
    const monto = parseFloat(montoMatch[1]);
    const referencia = refMatch[1].trim();
    const fechaRaw = dateMatch[1].trim(); 

    // 🌟 NUEVO: Lógica para procesar la Hora (am/pm a 24h)
    let horaISO = "12:00:00"; 
    if (timeMatch) {
        let horaRaw = timeMatch[1].trim().toLowerCase();
        let matchReloj = horaRaw.match(/(\d+):(\d+)\s*(am|pm)?/);
        
        if(matchReloj) {
            let h = parseInt(matchReloj[1]);
            let m = matchReloj[2];
            let ampm = matchReloj[3];
            
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            
            horaISO = `${h.toString().padStart(2, '0')}:${m}:00`;
        }
    }

    // Convertimos la fecha y le sumamos la hora exacta con Zona Horaria de Colombia (-05:00)
    const partesFecha = fechaRaw.split('/');
    let fechaISO = new Date().toISOString(); 
    if (partesFecha.length === 3) {
        fechaISO = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}T${horaISO}-05:00`;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: existente } = await supabase
        .from('transferencias')
        .select('referencia')
        .eq('referencia', referencia)
        .single();

    if (existente) {
         return res.status(200).json({ mensaje: '⚠️ Este comprobante ya había sido registrado anteriormente.' });
    }

    const { error } = await supabase.from('transferencias').insert({
        plataforma: plataforma,
        monto: monto,
        referencia: referencia,
        fecha_pago: fechaISO,
        estado: 'LIBRE'
    });

    if (error) throw error;

    res.status(200).json({ mensaje: `✅ ¡Pago de $${monto} en ${plataforma} guardado con éxito!` });

  } catch (error) {
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
}
