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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const prompt = `
      Eres un asistente bancario experto en bancos colombianos (Bancolombia, Nequi, Daviplata). Analiza este comprobante bancario y extrae los datos TAL CUAL aparecen.
      Devuelve ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin comillas invertidas, solo llaves y texto).
      Reemplaza comas por puntos en los decimales si aplica, pero devuelve enteros si no hay centavos.

      CONTEXTO: Este sistema es de una empresa de rifas. Los asesores suben pantallazos desde las cuentas bancarias del negocio.

      Para el campo "tipo": clasifica como "egreso" SOLO si el valor tiene signo NEGATIVO (-) o aparece en color ROJO. Si no tiene signo negativo y no está en rojo, clasifica como "ingreso". En caso de duda, pon "ingreso".

      Formato exacto esperado:
      {
        "tipo": "ingreso" o "egreso",
        "plataforma": "Nombre del banco o app (Ej: Bancolombia, Nequi, Daviplata)",
        "monto": "Solo el número absoluto sin símbolos ni signos (Ej: 3000000). NUNCA incluyas el signo negativo.",
        "referencia": "Código de comprobante o referencia. Si no hay, pon '0'",
        "fecha_pago": "La fecha exacta en formato YYYY-MM-DD",
        "hora_pago": "La hora en formato HH:MM:00 (Formato 24h. Obligatorio poner los segundos). Si no hay hora, pon '12:00:00'",
        "descripcion_movimiento": "El campo 'Descripción' del comprobante bancario, TAL CUAL aparece (Ej: 'Valor iva', 'Compra POS', 'Transferencia a terceros'). Si no hay, pon ''",
        "valor_original": "El valor TAL CUAL aparece en el comprobante, con signos y símbolos incluidos (Ej: 'COP $ 180.000,00' o 'COP -$ 538,07' o '-21,478.00'). Cópialo exacto."
      }
    `;

    // 4. Llamada a Claude Sonnet 4 (Anthropic Vision)
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
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64SinPrefijo } },
              { type: 'text', text: prompt }
            ]
          }
        ]
      })
    });

    const dataAI = await responseAI.json();
    if (dataAI.error) throw new Error("Error en Claude: " + (dataAI.error.message || JSON.stringify(dataAI.error)));

    const respuestaTexto = (dataAI.content && dataAI.content[0] ? dataAI.content[0].text : '').trim();
    const jsonLimpio = respuestaTexto.replace(/```json/g, '').replace(/```/g, '').trim();
    const datos = JSON.parse(jsonLimpio);

    if (!datos.monto || !datos.referencia || !datos.fecha_pago) {
       return res.status(400).json({ status: 'error', mensaje: 'La imagen es borrosa o no es un comprobante válido.' });
    }

    // Clasificación definitiva basada en el signo del valor original.
    // Si el valor tiene un "-" es egreso, si no tiene es ingreso.
    // Esto es más confiable que la interpretación de la IA.
    const valorOriginal = (datos.valor_original || '').trim();
    if (valorOriginal) {
      const tieneSignoNegativo = valorOriginal.includes('-');
      datos.tipo = tieneSignoNegativo ? 'egreso' : 'ingreso';
    }

    // Si la IA detectó que es un EGRESO (valor negativo / rojo / retiro), no lo guardamos
    // como transferencia libre — primero verificamos duplicados en gastos, luego lo devolvemos
    // para que el asesor lo justifique.
    if (datos.tipo === 'egreso') {
      // ESCUDO ANTI-CLONES para egresos: misma lógica que ingresos pero contra tabla 'gastos'
      const { data: gastosExistentes } = await supabase
        .from('gastos')
        .select('id, fecha, hora, monto, plataforma, referencia, categoria, descripcion')
        .eq('monto', Number(datos.monto))
        .eq('fecha', datos.fecha_pago);

      if (gastosExistentes && gastosExistentes.length > 0) {
        const gastoDuplicado = gastosExistentes.find(g => {
          const mismaRef   = String(datos.referencia).toLowerCase().trim() === String(g.referencia || '').toLowerCase().trim();
          const mismaPlatf = datos.plataforma.toLowerCase().trim() === String(g.plataforma || '').toLowerCase().trim();
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

      let urlComprobanteEgreso = null;
      try {
        const base64Data = imagenBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `gasto_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
        const { error: upErr } = await supabase.storage.from('comprobantes').upload(fileName, buffer, { contentType: 'image/jpeg' });
        if (!upErr) {
          const { data: pubUrl } = supabase.storage.from('comprobantes').getPublicUrl(fileName);
          urlComprobanteEgreso = pubUrl.publicUrl;
        }
      } catch (_) {}

      return res.status(200).json({
        status: 'es_egreso',
        mensaje: 'Detectado como egreso (valor negativo o retiro).',
        datosExtraidos: {
          plataforma: datos.plataforma,
          monto: datos.monto,
          referencia: datos.referencia,
          fecha_pago: datos.fecha_pago,
          hora_pago: datos.hora_pago,
          descripcion_movimiento: datos.descripcion_movimiento || ''
        },
        url_comprobante: urlComprobanteEgreso
      });
    }

    // 5. ESCUDO ANTI-CLONES
    // Busca transferencias con el mismo monto y fecha como filtro inicial (red amplia).
    // Luego compara TODOS los campos disponibles: plataforma, referencia y hora (a nivel de minuto).
    // Solo si todos coinciden se considera duplicado. Así, dos transferencias Nequi→Bancolombia
    // con el mismo monto/referencia/fecha pero distinta hora se registran como pagos independientes.
    const { data: existentes, error: errExistentes } = await supabase
        .from('transferencias')
        .select('*')
        .eq('monto', Number(datos.monto))
        .eq('fecha_pago', datos.fecha_pago);

    if (errExistentes) throw errExistentes;

    let esDuplicado = false;
    let transferenciaOriginal = null;

    if (existentes && existentes.length > 0) {
        esDuplicado = existentes.some(tExist => {
            // 1. Plataforma (sin distinción de mayúsculas)
            const mismaPlatf = datos.plataforma.toLowerCase().trim() === String(tExist.plataforma).toLowerCase().trim();

            // 2. Referencia exacta (sin distinción de mayúsculas ni espacios)
            const mismaRef = String(datos.referencia).toLowerCase().trim() === String(tExist.referencia).toLowerCase().trim();

            // 3. Hora a nivel de minuto (HH:MM) — los segundos pueden variar entre comprobantes
            const horaNew  = (datos.hora_pago  || '').substring(0, 5);
            const horaExist = (tExist.hora_pago || '').substring(0, 5);
            const mismaHora = horaNew !== '' && horaExist !== '' && horaNew === horaExist;

            const coinciden = mismaPlatf && mismaRef && mismaHora;
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
