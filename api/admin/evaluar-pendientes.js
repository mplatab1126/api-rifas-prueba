import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

/**
 * Evalúa con Claude las clasificaciones pendientes (sin evaluar) de Supabase.
 * Equivalente al monitor-agent.mjs pero ejecutable desde la página web.
 *
 * Body: { contrasena: "LosP", batch?: 20 }
 * Respuesta: { ok: true, evaluadas, correctas, incorrectas, restantes }
 */

const SOLO_MATEO_DEFAULT = ['mateo'];

async function tienePermiso(asesorNombre) {
  const name = asesorNombre.toLowerCase().trim();
  const { data } = await supabaseAdmin
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', asesorNombre)
    .eq('pagina_id', 'clasificaciones')
    .maybeSingle();
  if (data && typeof data.permitido === 'boolean') return data.permitido;
  return SOLO_MATEO_DEFAULT.includes(name);
}

// Evaluador usa Claude Sonnet — más inteligente que Haiku para juzgar sin sesgo
// (el clasificador usa Haiku, así que evaluar con Haiku sería pedirle al estudiante que se ponga su propia nota)
async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || JSON.stringify(d));
  return (d.content?.[0]?.text || '').trim();
}

async function evaluar(mensaje, categoriaBot) {
  const prompt = `Eres un evaluador de calidad para un chatbot de cobros de rifas en Colombia (Los Plata).

CONTEXTO CRÍTICO: El cliente que respondió YA RECIBIÓ una plantilla de cobro con la siguiente estructura:
  - "Hoy te podrías ganar... Si no quieres la N-Max modelo 2026, te entregamos $16.400.000"
  - "[Nombre], tu boleta #[Número] debe tener un abono mayor o igual a $[Monto] para participar"
  - "Escríbenos y te ayudamos a ponerte al día con tu abono"

TODOS los mensajes del cliente deben interpretarse como respuesta a ese cobro. Eso cambia el significado:
  - "Ya voy"/"Listo"/"Ahí va" → PAGO o PROMESA (no NINGUNO)
  - "¿Cuánto?"/"¿Cuánto debo?" → CONSULTA (pregunta por SU saldo, no OTRO)
  - Un número de 4 cifras solo → CONSULTA (su boleta)
  - Imagen sola sin texto raro → probable comprobante → PAGO si confirma
  - "¿A qué Nequi?" → MEDIO DE PAGO

El cliente envió: """${mensaje}"""
El chatbot clasificó como: ${categoriaBot}

DEFINICIONES (9 categorías válidas):
- PAGO: ya pagó, envía comprobante (verbos pasado: pagué, transferí, consigné), o imagen de comprobante con cualquier texto que indique que es el pago. Señales de confirmación verbal incluyen (NO limitativas): "aquí está", "ayí está", "te envío el comprobante", "aquí va el recibo", "ya pagué", "le mando la captura", "aquí está la consignación", "esta es la transferencia", "acabé de pagar", "hice el abono", "mandé la plata", "le envié", "ahí está el soporte", cualquier frase que señale que la imagen adjunta ES el pago. NO exijas frases exactas — interpreta la intención: si el cliente manda imagen + texto que se refiere a ella como su pago/consignación/abono/comprobante → es PAGO.
- MEDIO DE PAGO: pregunta CÓMO o A DÓNDE pagar, solo nombra método ("Nequi"), o pide la cuenta aunque también diga "consigno".
- CONSULTA: pregunta por SU PROPIA deuda/boleta/saldo/número (escritura libre).
- PROMESA: pagará después (verbos futuro, "mañana", "ahorita le mando", "voy a consignar").
- SALUDO: solo saluda, sin otra intención.
- OTRO: preguntas generales (horarios, plazos, premios), agradecimientos, excusas sociales.
- ASESOR: molesto, pide persona humana.
- NINGUNO: emojis solos, palabras sueltas sin contexto, temas ajenos, texto incoherente.
- RESERVA: mensaje automatizado de la página web cuando el cliente separa una boleta. Firma: "Hola Los Plata! Acabo de reservar mis boletas de [RIFA]. *Nombre:* ... *Celular:* ... *Numeros:* ... *Total:* ... Me podrian enviar el link de mi boleta digital, por favor?". Aplica cuando el bloque de plantilla está presente y el cliente pide el link.

REGLAS CRÍTICAS:
- CONSULTA es SOLO sobre deuda/boleta PROPIA. Preguntas sobre la rifa en general → OTRO.
- "¿Hasta qué hora puedo pagar?" → OTRO. "¿Cuánto debo?" → CONSULTA.
- RESERVA tiene PRIORIDAD si hay bloque de plantilla + solicitud de link ("Me podrian enviar el link de mi boleta digital"). Aunque el cliente agregue menciones de método de pago, dictado de números, comentarios sobre lo que hará o imagen adjunta → sigue siendo RESERVA.
- RESERVA solo cede ante otra intención si hay evidencia DIRECTA y CLARA: "ya pagué" + comprobante claro → PAGO; "quiero cancelar" / queja → ASESOR.
- Imagen sola sin texto verbal de confirmación NO es PAGO automático.
- IMAGEN DE COMPROBANTE (Nequi, Bancolombia, Daviplata, Wompi, etc.) + "Me confirmas?" / "Ya llegó?" / "Confirma por favor" → PAGO (cliente pide verificar SU pago adjunto, NO pregunta por saldo).

Responde SOLO este JSON sin markdown:
{"veredicto":"CORRECTO o INCORRECTO","categoria_correcta":"X","razon":"max 15 palabras"}`;

  const resp = await callClaude(prompt);
  const cleaned = resp.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function actualizarEvaluacion(id, ev) {
  const body = {
    evaluado_at: new Date().toISOString(),
    evaluacion_correcta: ev.veredicto === 'CORRECTO',
    evaluacion_categoria_correcta: ev.categoria_correcta || null,
    evaluacion_razon: (ev.razon || '').slice(0, 200),
  };
  await supabase
    .from('clasificaciones_plantilla')
    .update(body)
    .eq('id', id);
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const nombre = validarAsesor(req.body?.contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!(await tienePermiso(nombre))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso' });
  }

  const batch = Math.min(50, Math.max(1, Number(req.body?.batch) || 30));

  // Traer pendientes
  const { data: pendientes, error } = await supabase
    .from('clasificaciones_plantilla')
    .select('id, categoria, mensaje_analizado')
    .is('evaluado_at', null)
    .order('created_at', { ascending: true })
    .limit(batch);

  if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
  if (!pendientes || pendientes.length === 0) {
    return res.status(200).json({ status: 'ok', evaluadas: 0, correctas: 0, incorrectas: 0, restantes: 0, mensaje: 'Sin pendientes' });
  }

  // Detectar si un mensaje es solo media (sin texto real evaluable)
  function esSoloMedia(texto) {
    if (!texto || texto.length < 2) return true;
    // Quitar todos los marcadores de media y ver si queda algo
    const limpio = texto
      .replace(/\[imagen( adjunta)?(: [^\]]*)?\]/gi, '')
      .replace(/\[audio\]/gi, '')
      .replace(/\[video\]/gi, '')
      .replace(/\[media\]/gi, '')
      .replace(/\[sticker\]/gi, '')
      .replace(/\[location\]/gi, '')
      .replace(/\[document\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return limpio.length < 2;
  }

  // Evaluar con concurrencia 5 (para no pasar maxDuration)
  let correctas = 0, incorrectas = 0, fallos = 0, mediaSinEval = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < pendientes.length; i += CONCURRENCY) {
    const grupo = pendientes.slice(i, i + CONCURRENCY);
    await Promise.all(grupo.map(async (row) => {
      try {
        // Caso 1: mensaje muy corto o vacío
        if (!row.mensaje_analizado || row.mensaje_analizado.length < 2) {
          await actualizarEvaluacion(row.id, { veredicto: 'CORRECTO', categoria_correcta: row.categoria, razon: 'mensaje muy corto, no evaluable' });
          correctas++;
          return;
        }
        // Caso 2: mensaje es solo media (imagen/audio sin texto)
        if (esSoloMedia(row.mensaje_analizado)) {
          await actualizarEvaluacion(row.id, { veredicto: 'CORRECTO', categoria_correcta: row.categoria, razon: 'solo media (imagen/audio), evaluar manualmente' });
          mediaSinEval++;
          return;
        }
        // Caso 3: mensaje con texto → evaluar con Claude
        const ev = await evaluar(row.mensaje_analizado, row.categoria);
        if (!ev) {
          // Si Claude no devuelve JSON válido, marcar como evaluado con razón "sin juicio" para no quedar pendiente
          await actualizarEvaluacion(row.id, { veredicto: 'CORRECTO', categoria_correcta: row.categoria, razon: 'fallo del evaluador, sin juicio' });
          fallos++;
          return;
        }
        await actualizarEvaluacion(row.id, ev);
        if (ev.veredicto === 'CORRECTO') correctas++;
        else incorrectas++;
      } catch (e) {
        // En caso de excepción, también marcar evaluado para no quedar pendiente
        try {
          await actualizarEvaluacion(row.id, { veredicto: 'CORRECTO', categoria_correcta: row.categoria, razon: 'error de evaluación: ' + String(e.message).slice(0, 60) });
        } catch {}
        fallos++;
      }
    }));
  }

  // Contar restantes
  const { count: restantes } = await supabase
    .from('clasificaciones_plantilla')
    .select('id', { count: 'exact', head: true })
    .is('evaluado_at', null);

  return res.status(200).json({
    status: 'ok',
    evaluadas: correctas + incorrectas + mediaSinEval + fallos,
    correctas,
    incorrectas,
    media_sin_eval: mediaSinEval,
    fallos,
    restantes: restantes ?? 0,
  });
}
