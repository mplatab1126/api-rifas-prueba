/**
 * Lector de comprobantes bancarios (solo lectura, NO guarda nada).
 *
 * Extrae los datos de una imagen de comprobante con Claude, usando el MISMO
 * prompt y la MISMA normalización que api/admin/procesar-ia.js. Aquí solo
 * EXTRAE: no inserta transferencias ni abonos. Lo usa la bandeja para leer el
 * pantallazo del cliente y luego buscar la transferencia real que coincida.
 *
 * Devuelve: { ok, datos: { plataforma, monto, referencia, fecha_pago, hora_pago, descripcion_movimiento } }
 */

const PROMPT = `
Eres un asistente bancario experto en bancos colombianos (Bancolombia, Nequi, Daviplata). Analiza este comprobante bancario y extrae los datos TAL CUAL aparecen.
Devuelve ÚNICAMENTE un objeto JSON válido (sin formato Markdown, sin comillas invertidas, solo llaves y texto).
Reemplaza comas por puntos en los decimales si aplica, pero devuelve enteros si no hay centavos.

CONTEXTO: Este sistema es de una empresa de rifas. El cliente envía un pantallazo de la transferencia que le hizo a la empresa.

Formato exacto esperado:
{
  "plataforma": "Decide SIEMPRE mirando el texto del campo 'Descripción' del movimiento (NO el logo del encabezado). Reglas: si la descripción contiene 'nequi' → 'Nequi'; si contiene 'daviplata' → 'Daviplata'; si contiene 'corresponsal' → 'Corresponsal'; en cualquier otro caso → 'Bancolombia'.",
  "monto": "Solo el número absoluto sin símbolos ni signos (Ej: 3000000). NUNCA incluyas el signo negativo.",
  "referencia": "SOLO el código o número alfanumérico del campo 'Referencia' (o 'No. de aprobación' / 'Código de transacción' / 'Comprobante No.' según el banco). NO incluyas la descripción ni texto antes o después. Ejemplos: '3186425497', 'M02245028', 'TR6ETNl1ZvEC'. Si no hay, pon '0'.",
  "fecha_pago": "La fecha exacta en formato YYYY-MM-DD",
  "hora_pago": "La hora del MOVIMIENTO BANCARIO (cuando se hizo la transferencia), NO la hora de descarga/consulta del comprobante. Formato HH:MM:SS (24h). Incluye los segundos REALES, no los redondees. Si no hay hora visible, pon '12:00:00'",
  "telefono_origen": "Si el comprobante muestra el celular DESDE donde se hizo el envío (campos como '¿Desde dónde se hizo el envío?' o 'Celular'), pon ese número. Si no aparece, pon ''",
  "descripcion_movimiento": "El campo 'Descripción' del comprobante TAL CUAL aparece. Si no hay, pon ''",
  "valor_original": "El valor TAL CUAL aparece, con signos y símbolos (Ej: 'COP $ 180.000,00'). Cópialo exacto."
}
`;

export async function extraerDatos(base64SinPrefijo, mimeType = 'image/jpeg') {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { ok: false, error: 'Falta ANTHROPIC_API_KEY en Vercel.' };

  const bodyAI = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType.includes('png') ? 'image/png' : 'image/jpeg', data: base64SinPrefijo } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });

  let dataAI;
  const MAX_REINTENTOS = 4;
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const responseAI = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: bodyAI,
    });
    dataAI = await responseAI.json();
    const esOverload = responseAI.status === 529 ||
      (dataAI.error && (dataAI.error.type === 'overloaded_error' || (dataAI.error.message || '').toLowerCase().includes('overloaded')));
    if (esOverload && intento < MAX_REINTENTOS - 1) {
      await new Promise(r => setTimeout(r, (intento + 1) * 3000));
      continue;
    }
    break;
  }

  if (dataAI.error) return { ok: false, error: 'Error en Claude: ' + (dataAI.error.message || JSON.stringify(dataAI.error)) };

  let datos;
  try {
    const texto = (dataAI.content && dataAI.content[0] ? dataAI.content[0].text : '').trim();
    datos = JSON.parse(texto.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (e) {
    return { ok: false, error: 'La imagen es borrosa o no es un comprobante válido.' };
  }

  if (!datos.monto || !datos.fecha_pago) {
    return { ok: false, error: 'No se pudo leer el monto o la fecha del comprobante.' };
  }

  // ── Normalización (misma lógica que procesar-ia.js) ──
  const descLower = (datos.descripcion_movimiento || '').toLowerCase();
  if (descLower.includes('corresponsal')) datos.plataforma = 'Corresponsal';
  else if (descLower.includes('nequi')) datos.plataforma = 'Nequi';
  else if (descLower.includes('daviplata')) datos.plataforma = 'Daviplata';

  // Referencia: si viene con descripción mezclada, quedarnos con el último código largo
  if (datos.referencia) {
    const tokens = String(datos.referencia).trim().match(/[A-Za-z0-9]+/g) || [];
    const codigo = tokens.reverse().find(t => t.length >= 4 && /\d/.test(t));
    if (codigo) datos.referencia = codigo;
  }

  // Pago por llave (Bre-B): la referencia real es el nombre del remitente
  const descLlave = (datos.descripcion_movimiento || '').trim();
  if (/^pago\s+llave/i.test(descLlave)) {
    let nombre = descLlave.replace(/^pago\s+llave\s*/i, '').trim();
    const refNum = String(datos.referencia || '').trim();
    if (refNum && nombre.endsWith(refNum)) nombre = nombre.slice(0, -refNum.length).trim();
    nombre = nombre.replace(/\s+/g, ' ').trim();
    if (nombre) datos.referencia = nombre;
  }

  return { ok: true, datos };
}
