import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { imagenBase64, contrasena } = req.body;

  // 2. Seguridad
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!imagenBase64) return res.status(400).json({ status: 'error', mensaje: 'No se envió ninguna imagen' });

  // Necesitarás agregar esta variable en tu panel de Vercel
  const openAiKey = process.env.OPENAI_API_KEY; 
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 3. Instrucciones estrictas para OpenAI
    const prompt = `
      Eres un asistente contable experto y preciso. Analiza este comprobante de transferencia bancaria y extrae la siguiente información.
      Devuelve ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin comillas invertidas, solo llaves y texto).
      
      Formato esperado:
      {
        "plataforma": "El nombre del banco o app (Ej: Nequi, Bancolombia, Daviplata)",
        "monto": "Solo el número, sin el símbolo de pesos ni puntos (Ej: 20000)",
        "referencia": "El número de comprobante, referencia o código de aprobación",
        "fecha_pago": "La fecha exacta en formato YYYY-MM-DD",
        "hora_pago": "La hora en formato HH:MM:00 (formato 24h)"
      }
    `;

    // 4. Llamada a la API de OpenAI (Modelo GPT-4o Vision)
    const responseAI = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imagenBase64 } }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.0 // 0.0 para que sea súper preciso y matemático
      })
    });

    const dataAI = await responseAI.json();
    
    if (dataAI.error) throw new Error("Error en OpenAI: " + dataAI.error.message);

    // 5. Limpiamos la respuesta y la convertimos en objeto
    const respuestaTexto = dataAI.choices[0].message.content.trim();
    const jsonLimpio = respuestaTexto.replace(/```json/g, '').replace(/```/g, '').trim();
    const datos = JSON.parse(jsonLimpio);

    // Validación de que la IA encontró el monto y la referencia
    if (!datos.monto || !datos.referencia || !datos.fecha_pago) {
       return res.status(400).json({ status: 'error', mensaje: 'La imagen borrosa o no es un comprobante válido.' });
    }

    // 6. ESCUDO ANTI-CLONES
    const { data: existentes, error: errExistentes } = await supabase
        .from('transferencias')
        .select('*')
        .eq('monto', Number(datos.monto))
        .eq('fecha_pago', datos.fecha_pago);

    if (errExistentes) throw errExistentes;

    let esDuplicado = false;
    if (existentes && existentes.length > 0) {
        esDuplicado = existentes.some(tExist => {
            // Regla para Nequi: Compara los últimos 4 dígitos
            if (datos.plataforma.toLowerCase().includes('nequi') && tExist.plataforma.toLowerCase().includes('nequi')) {
                const digitosNueva = String(datos.referencia).replace(/\D/g, ''); 
                const digitosExist = String(tExist.referencia).replace(/\D/g, '');
                if (digitosNueva.length >= 4 && digitosExist.length >= 4) {
                    return digitosNueva.slice(-4) === digitosExist.slice(-4);
                }
            }
            // Regla para otros bancos: Referencia exacta
            return String(datos.referencia).trim() === String(tExist.referencia).trim();
        });
    }

    if (esDuplicado) {
        return res.status(200).json({ status: 'duplicado', mensaje: `La referencia ${datos.referencia} ya estaba registrada.` });
    }

    // 7. Guardar en Supabase
    const { error: errInsert } = await supabase.from('transferencias').insert({
        plataforma: datos.plataforma,
        monto: Number(datos.monto),
        referencia: String(datos.referencia),
        fecha_pago: datos.fecha_pago,
        hora_pago: datos.hora_pago || '12:00:00',
        estado: 'LIBRE'
    });

    if (errInsert) throw errInsert;

    return res.status(200).json({ 
        status: 'ok', 
        mensaje: `✅ $${datos.monto} en ${datos.plataforma} guardado.`, 
        datosExtraidos: datos 
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error en el servidor: ' + error.message });
  }
}
