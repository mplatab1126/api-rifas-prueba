import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { imagenBase64, contrasena, soloConsulta } = req.body;

  // 2. Seguridad
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!imagenBase64) return res.status(400).json({ status: 'error', mensaje: 'No se envió ninguna imagen' });

  const openAiKey = process.env.OPENAI_API_KEY; 
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const prompt = `
      Eres un asistente bancario experto. Analiza este comprobante de transferencia y extrae los datos.
      Devuelve ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin comillas invertidas, solo llaves y texto).
      Reemplaza comas por puntos en los decimales si aplica, pero devuelve enteros si no hay centavos.
      
      Formato exacto esperado:
      {
        "plataforma": "Nombre del banco o app (Ej: Nequi, Bancolombia, Daviplata)",
        "monto": "Solo el número sin símbolos (Ej: 20000)",
        "referencia": "Código de comprobante o referencia. Si no hay, pon '0'",
        "fecha_pago": "La fecha exacta en formato YYYY-MM-DD",
        "hora_pago": "La hora en formato HH:MM:00 (Formato 24h. Obligatorio poner los segundos)"
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
        temperature: 0.0
      })
    });

    const dataAI = await responseAI.json();
    if (dataAI.error) throw new Error("Error en OpenAI: " + dataAI.error.message);

    const respuestaTexto = dataAI.choices[0].message.content.trim();
    const jsonLimpio = respuestaTexto.replace(/```json/g, '').replace(/```/g, '').trim();
    const datos = JSON.parse(jsonLimpio);

    if (!datos.monto || !datos.referencia || !datos.fecha_pago) {
       return res.status(400).json({ status: 'error', mensaje: 'La imagen es borrosa o no es un comprobante válido.' });
    }

    // 5. ESCUDO ANTI-CLONES (Con detector de detalles del clon)
    const { data: existentes, error: errExistentes } = await supabase
        .from('transferencias')
        .select('*')
        .eq('monto', Number(datos.monto))
        .eq('fecha_pago', datos.fecha_pago);

    if (errExistentes) throw errExistentes;

    let esDuplicado = false;
    let transferenciaOriginal = null; // Aquí guardaremos la que ya existía

    if (existentes && existentes.length > 0) {
        esDuplicado = existentes.some(tExist => {
            let coinciden = false;
            const plataformaNueva = datos.plataforma.toLowerCase();
            const plataformaExist = String(tExist.plataforma).toLowerCase();

            if (plataformaNueva.includes('nequi') && plataformaExist.includes('nequi')) {
                // Nequi→Nequi: comparar últimos 4 dígitos de la referencia
                const digitosNueva = String(datos.referencia).replace(/\D/g, '');
                const digitosExist = String(tExist.referencia).replace(/\D/g, '');
                if (digitosNueva.length >= 4 && digitosExist.length >= 4) {
                    coinciden = digitosNueva.slice(-4) === digitosExist.slice(-4);
                }
            } else if (plataformaNueva.includes('bancolombia') || plataformaExist.includes('bancolombia')) {
                // Bancolombia: las referencias entre la app del cliente y el extracto SVN pueden diferir
                // (p.ej. "0000049000" vs "86096513013"), así que usamos la hora como criterio secundario.
                // EXCEPCIÓN: si ambas referencias son numéricas largas (≥7 dígitos, ej: teléfonos Nequi)
                // y son distintas, son pagadores diferentes — NO usar el minuto como criterio.
                const refNueva = String(datos.referencia).replace(/\D/g, '');
                const refExistente = String(tExist.referencia).replace(/\D/g, '');
                const refEsNula = refNueva === '0' || refNueva === '';
                const refExacta = !refEsNula && String(datos.referencia).trim() === String(tExist.referencia).trim();
                if (refExacta) {
                    coinciden = true;
                } else if (datos.hora_pago && tExist.hora_pago) {
                    const ambasConReferencia = refNueva.length >= 7 && refExistente.length >= 7;
                    if (!ambasConReferencia) {
                        // Solo usar el minuto como criterio cuando no hay referencias únicas identificables
                        const mismoMinuto = datos.hora_pago.substring(0, 5) === tExist.hora_pago.substring(0, 5);
                        coinciden = mismoMinuto;
                    }
                }
            } else {
                coinciden = String(datos.referencia).trim() === String(tExist.referencia).trim();
            }

            if (coinciden) {
                transferenciaOriginal = tExist;
                return true;
            }
            return false;
        });
    }

    if (esDuplicado) {
        return res.status(200).json({ 
            status: 'duplicado', 
            mensaje: `Ya registrada el ${transferenciaOriginal.fecha_pago}`,
            clon: transferenciaOriginal
        });
    }

    // Si es solo consulta (pegar foto del cliente), NO crear nada — informar que no se encontró
    if (soloConsulta) {
        return res.status(200).json({
            status: 'no_encontrada',
            mensaje: `No se encontró ninguna transferencia de $${datos.monto} del ${datos.fecha_pago} en el sistema. Verifica que esté cargada con Carga IA.`,
            datosExtraidos: datos
        });
    }

    // 6. 🚀 SUBIR LA IMAGEN A SUPABASE STORAGE 🚀
    // Convertimos la imagen Base64 a código binario (Buffer) para que Supabase la guarde
    const base64Data = imagenBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `pago_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('comprobantes')
        .upload(fileName, buffer, {
            contentType: 'image/jpeg'
        });

    if (uploadError) throw new Error("Error subiendo la foto: " + uploadError.message);

    // Obtenemos el link público de la imagen que acabamos de subir
    const { data: publicUrlData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
    const urlFoto = publicUrlData.publicUrl;

    // 7. Guardar en Supabase Database (Ahora incluyendo la URL de la foto)
    const { error: errInsert } = await supabase.from('transferencias').insert({
        plataforma: datos.plataforma,
        monto: Number(datos.monto),
        referencia: String(datos.referencia),
        fecha_pago: datos.fecha_pago,
        hora_pago: datos.hora_pago || '12:00:00',
        estado: 'LIBRE',
        url_comprobante: urlFoto // <-- ¡Aquí guardamos el link en la tabla!
    });

    if (errInsert) throw errInsert;

    return res.status(200).json({ 
        status: 'ok', 
        mensaje: `✅ $${datos.monto} guardado con su foto en la nube.`, 
        datosExtraidos: datos 
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error: ' + error.message });
  }
}
