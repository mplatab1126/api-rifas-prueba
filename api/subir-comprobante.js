import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos para que Chatea Pro pueda enviar los datos
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Recibimos el texto que extrajo la IA desde Chatea Pro
  // Soportamos que llegue por POST (Body) o por GET (URL)
  const textoIA = req.body?.texto_ia || req.query?.texto_ia;

  // Si la IA dijo ERROR o no mandó nada, detenemos todo
  if (!textoIA || textoIA.includes('ERROR')) {
    return res.status(400).json({ error: 'La IA no pudo leer el comprobante o el texto es inválido.' });
  }

  try {
    // 3. EXTRACCIÓN INTELIGENTE: Buscamos las palabras clave en el texto de la IA
    const platformMatch = textoIA.match(/Plataforma:\s*([^,]+)/i);
    const montoMatch = textoIA.match(/Monto:\s*(\d+)/i);
    const refMatch = textoIA.match(/Referencia:\s*([^,]+)/i);
    const dateMatch = textoIA.match(/Fecha:\s*([\d\/]+)/i);

    if (!platformMatch || !montoMatch || !refMatch || !dateMatch) {
        return res.status(400).json({ error: 'Faltan datos clave en la lectura de la IA.' });
    }

    const plataforma = platformMatch[1].trim();
    const monto = parseFloat(montoMatch[1]);
    const referencia = refMatch[1].trim();
    const fechaRaw = dateMatch[1].trim(); // Formato esperado: DD/MM/AAAA

    // 4. Convertimos la fecha (DD/MM/AAAA) al formato de base de datos (AAAA-MM-DD)
    const partesFecha = fechaRaw.split('/');
    let fechaISO = new Date().toISOString(); // Por defecto hoy
    if (partesFecha.length === 3) {
        // Ponemos hora 12:00 pm para evitar problemas de zona horaria
        fechaISO = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]}T12:00:00.000Z`;
    }

    // 5. Conectamos con Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // 6. SEGURIDAD: Verificamos que la referencia no exista ya (para no duplicar pagos)
    const { data: existente } = await supabase
        .from('transferencias')
        .select('referencia')
        .eq('referencia', referencia)
        .single();

    if (existente) {
         return res.status(200).json({ mensaje: '⚠️ Este comprobante ya había sido registrado anteriormente.' });
    }

    // 7. Guardamos la transferencia en la central (Lista para que los asesores la usen)
    const { error } = await supabase.from('transferencias').insert({
        plataforma: plataforma,
        monto: monto,
        referencia: referencia,
        fecha_pago: fechaISO,
        estado: 'LIBRE'
    });

    if (error) throw error;

    // 8. Le confirmamos a Chatea Pro que fue un éxito
    res.status(200).json({ mensaje: `✅ ¡Pago de $${monto} en ${plataforma} guardado con éxito!` });

  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
  }
}
