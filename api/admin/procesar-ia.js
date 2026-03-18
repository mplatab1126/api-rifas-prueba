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

      CONTEXTO DEL NEGOCIO: Este sistema es de una empresa de rifas. Los asesores suben pantallazos tomados directamente desde las cuentas bancarias del negocio (Bancolombia, Nequi, Daviplata). La GRAN MAYORÍA de comprobantes son pagos que CLIENTES enviaron al negocio, es decir INGRESOS. Los egresos reales son poco frecuentes.

      REGLA CRÍTICA para identificar el tipo (sigue este orden de prioridad):

      PRIORIDAD 1 — SIGNO Y COLOR DEL VALOR (esto manda por encima de todo):
      - Si el valor/monto tiene un signo NEGATIVO (-) delante o aparece en ROJO → tipo "egreso"
      - Si el valor/monto NO tiene signo negativo y NO aparece en rojo → tipo "ingreso"

      PRIORIDAD 2 — SOLO si no puedes determinar el signo/color, usa las palabras del ENCABEZADO o TÍTULO del comprobante (NO el mensaje/descripción del cliente):
      - Palabras que indican EGRESO: "Enviaste", "Retiro", "Pago a", "Débito", "Salida", "Cargo", "Compra", "Transferencia a terceros", "Transferencia enviada"
      - Palabras que indican INGRESO: "Te enviaron", "Recibiste", "Consignación", "Transferencia recibida", "Crédito", "Abono", "Entrada", "Depósito", "Transferencia nequi", "Transferencia daviplata"

      ⚠️ REGLA SOBRE DESCRIPCIONES/MENSAJES (MUY IMPORTANTE):
      El campo "descripción", "mensaje", "motivo" o "nota" que aparece en las transferencias es texto libre que escribió la persona que envió el dinero (el cliente). Palabras como "Ganador", "Rifa", "Premio", "Pago", "Cuota", "Abono rifa" en ese campo NO indican si es ingreso o egreso. IGNORA completamente el contenido de ese campo para decidir el tipo. Solo usa el signo/color del valor y las palabras del encabezado del comprobante.

      CONTEXTO NEQUI: Cuando llega dinero a una cuenta Nequi, la app dice "Te enviaron" o muestra el monto sin signo negativo. Si el comprobante de Nequi muestra una transferencia recibida (sin signo negativo, sin rojo), SIEMPRE es ingreso. Solo clasifica como egreso un comprobante de Nequi si dice "Enviaste" o el monto aparece en rojo o con signo negativo.

      CONTEXTO DAVIPLATA: En Daviplata, las transferencias recibidas muestran el monto positivo. Solo clasifica como egreso si el monto aparece negativo o en rojo.

      CONTEXTO BANCOLOMBIA: En los "Detalle de Movimiento" de Bancolombia, las descripciones tipo "Transferencia nequi bancolombi", "Transferencia daviplata bancolombi" o similares son INGRESOS (dinero que entró a la cuenta desde Nequi/Daviplata). Si el valor es positivo (sin signo negativo), SIEMPRE es ingreso.

      REGLA POR DEFECTO: Si tienes CUALQUIER duda y el valor NO tiene signo negativo ni aparece en rojo, clasifícalo como "ingreso". Es preferible clasificar erróneamente un egreso como ingreso a clasificar un ingreso como egreso.

      Formato exacto esperado:
      {
        "tipo": "ingreso" o "egreso" según las reglas anteriores,
        "plataforma": "Nombre del banco o app exactamente como aparece (Ej: Bancolombia, Nequi, Daviplata)",
        "monto": "Solo el número absoluto sin símbolos ni signos (Ej: 3000000). NUNCA incluyas el signo negativo.",
        "referencia": "Código de comprobante o referencia. Si no hay, pon '0'",
        "fecha_pago": "La fecha exacta en formato YYYY-MM-DD",
        "hora_pago": "La hora en formato HH:MM:00 (Formato 24h. Obligatorio poner los segundos). Si no hay hora, pon '12:00:00'",
        "descripcion_movimiento": "El campo 'Descripción' del comprobante bancario, TAL CUAL aparece (Ej: 'Valor iva', 'Compra POS', 'Transferencia a terceros'). Si no hay, pon ''"
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

    // Corrección automática: descripciones que SIEMPRE son ingresos en Bancolombia
    const descLower = (datos.descripcion_movimiento || '').toLowerCase().trim();
    const SIEMPRE_INGRESO = [
      'transferencia nequi bancolombi',
      'transferencia daviplata bancolombi',
      'consignacion nacional cheque',
      'consignacion nacional efectivo',
      'abono traslado ahorro',
      'abono intereses',
      'transferencia recibida'
    ];
    if (datos.tipo === 'egreso' && SIEMPRE_INGRESO.some(p => descLower.includes(p))) {
      datos.tipo = 'ingreso';
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
