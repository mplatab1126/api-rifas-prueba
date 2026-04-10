import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { imagenBase64, contrasena } = req.body;

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];

  const puedeRegistrarGastos = ['Mateo', 'Juan Pablo', 'Juan Pablo Rojas'];
  if (!nombreAsesor || !puedeRegistrarGastos.includes(nombreAsesor)) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso denegado. Solo Mateo o Juan Pablo pueden registrar gastos.' });
  }
  if (!imagenBase64) {
    return res.status(400).json({ status: 'error', mensaje: 'No se envió ninguna imagen.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    const prompt = `
      Eres un asistente contable experto. Analiza este comprobante de movimiento bancario (puede ser un retiro, transferencia saliente o pago).
      Devuelve ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin comillas invertidas).
      
      Formato exacto esperado:
      {
        "plataforma": "Nombre del banco o app (Ej: Bancolombia, Nequi, Daviplata)",
        "monto": "Solo el número entero sin símbolos ni separadores (Ej: 3000000)",
        "referencia": "Código del comprobante. Si no hay, pon '0'",
        "fecha_pago": "La fecha en formato YYYY-MM-DD",
        "hora_pago": "La hora en formato HH:MM:00 (24h). Si no hay hora, pon '12:00:00'"
      }
    `;

    const base64SinPrefijo = imagenBase64.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = imagenBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const responseAI = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64SinPrefijo } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const dataAI = await responseAI.json();
    if (dataAI.error) throw new Error('Error en Claude: ' + (dataAI.error.message || JSON.stringify(dataAI.error)));

    const texto = (dataAI.content && dataAI.content[0] ? dataAI.content[0].text : '').trim();
    const jsonLimpio = texto.replace(/```json/g, '').replace(/```/g, '').trim();
    const datos = JSON.parse(jsonLimpio);

    if (!datos.monto || !datos.fecha_pago) {
      return res.status(400).json({ status: 'error', mensaje: 'La imagen es borrosa o no contiene datos bancarios reconocibles.' });
    }

    // ESCUDO ANTI-CLONES para egresos: verificar contra tabla 'gastos' antes de subir la imagen
    const { data: gastosExistentes } = await supabase
      .from('gastos')
      .select('id, fecha, hora, monto, plataforma, referencia, categoria, descripcion')
      .eq('monto', Number(datos.monto))
      .eq('fecha', datos.fecha_pago);

    if (gastosExistentes && gastosExistentes.length > 0) {
      const gastoDuplicado = gastosExistentes.find(g => {
        const mismaRef   = String(datos.referencia || '').toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
        const mismaPlatf = String(datos.plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
        const horaNew    = (datos.hora_pago || '').substring(0, 5);
        const horaExist  = (g.hora || '').substring(0, 5);
        const mismaHora  = horaNew !== '' && horaExist !== '' && horaNew === horaExist;
        return mismaRef && mismaPlatf && mismaHora;
      });

      if (gastoDuplicado) {
        return res.status(200).json({
          status: 'duplicado_egreso',
          mensaje: `Este egreso ya fue registrado el ${gastoDuplicado.fecha}`,
          clon: gastoDuplicado
        });
      }
    }

    // Detección adicional por referencia (para egresos distribuidos en múltiples categorías)
    if (!gastosExistentes?.length && datos.referencia && datos.referencia !== '0') {
      const { data: refCheck } = await supabase
        .from('gastos')
        .select('id, fecha, monto, plataforma, referencia, categoria, descripcion')
        .eq('fecha', datos.fecha_pago)
        .eq('referencia', datos.referencia)
        .limit(1);
      if (refCheck && refCheck.length > 0) {
        const g = refCheck[0];
        if (String(datos.plataforma || '').toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim()) {
          return res.status(200).json({
            status: 'duplicado_egreso',
            mensaje: `Este egreso ya fue registrado el ${g.fecha} (distribuido)`,
            clon: g
          });
        }
      }
    }

    // Subir imagen a Supabase Storage
    const base64Data = imagenBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `gasto_${Date.now()}_${Math.floor(Math.random() * 9999)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });

    if (uploadError) throw new Error('Error subiendo el comprobante: ' + uploadError.message);

    const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(fileName);

    return res.status(200).json({
      status: 'ok',
      datosExtraidos: datos,
      url_comprobante: urlData.publicUrl
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error: ' + error.message });
  }
}
