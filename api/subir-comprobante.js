import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const textoIA = req.body?.texto_ia || req.query?.texto_ia;

  if (!textoIA || textoIA.includes('ERROR')) {
    return res.status(400).json({ error: 'La IA no pudo leer el comprobante.' });
  }

  try {
    const platformMatch = textoIA.match(/Plataforma:\s*([^,]+)/i);
    const montoMatch = textoIA.match(/Monto:\s*(\d+)/i);
    const refMatch = textoIA.match(/Referencia:\s*([^,]+)/i);
    const dateMatch = textoIA.match(/Fecha:\s*([^,]+)/i);
    const timeMatch = textoIA.match(/Hora:\s*([^,\n]+)/i);

    if (!platformMatch || !montoMatch || !refMatch || !dateMatch) {
        return res.status(400).json({ error: 'Faltan datos clave en la lectura.' });
    }

    const plataforma = platformMatch[1].trim();
    const monto = parseFloat(montoMatch[1]);
    const referencia = refMatch[1].trim();
    let fechaRaw = dateMatch[1].trim(); 

    // TRUCO 1: Arreglar fecha si el banco manda "26" en vez de "2026"
    fechaRaw = fechaRaw.replace(/[-\.]/g, '/');
    let partesFecha = fechaRaw.split('/');
    if (partesFecha.length === 3) {
        if (partesFecha[2].length === 2) {
            partesFecha[2] = "20" + partesFecha[2];
        }
    }

    // TRUCO 2: Arreglar hora si el banco manda "a m" con espacios o puntos
    let horaISO = "12:00:00"; 
    if (timeMatch) {
        let horaRaw = timeMatch[1].trim().toLowerCase();
        // Limpieza de texto profunda (convierte "a m" o "p.m." en "am" y "pm")
        horaRaw = horaRaw.replace(/\./g, '').replace(/a\s+m/g, 'am').replace(/p\s+m/g, 'pm').replace(/\s+/g, '');
        
        let matchReloj = horaRaw.match(/(\d+):(\d+)(am|pm)?/);
        if(matchReloj) {
            let h = parseInt(matchReloj[1]);
            let m = parseInt(matchReloj[2]);
            let ampm = matchReloj[3];
            
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            
            horaISO = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
        }
    }

    // Armamos la fecha final para Colombia (-05:00)
    let fechaISO = new Date().toISOString(); 
    if (partesFecha.length === 3) {
        fechaISO = `${partesFecha[2]}-${partesFecha[1].padStart(2, '0')}-${partesFecha[0].padStart(2, '0')}T${horaISO}-05:00`;
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
