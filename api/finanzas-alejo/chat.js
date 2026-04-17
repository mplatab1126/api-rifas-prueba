import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const MODEL = 'claude-opus-4-7';
const MAX_TURNS = 8;

const TOOLS = [
  {
    name: 'listar_cuentas',
    description: 'Lista las cuentas liquidas de Alejo (Efectivo, Bancolombia, etc.) con sus saldos actuales calculados.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'listar_categorias',
    description: 'Lista todas las categorias existentes. Usar SIEMPRE antes de crear una nueva para evitar duplicados semanticos (ej: "deuda" vs "deudas").',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'crear_categoria',
    description: 'Crea una nueva categoria. Antes de llamar esta herramienta, revisa con listar_categorias que no exista una equivalente.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre canonico de la categoria (ej: Comida, Transporte, Cafe)' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'registrar_movimiento',
    description: 'Registra un movimiento financiero. Para compras de activos (oro, CDT) confirma con el usuario antes de llamar (haces 2 llamadas: gasto + alta de activo). Para deudas pregunta la cuenta primero.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['gasto','ingreso','deuda_cobrar','deuda_pagar','transferencia','otro'] },
        monto: { type: 'number', description: 'Monto en COP, positivo' },
        categoria_id: { type: 'integer', description: 'ID de categoria existente. Opcional.' },
        cuenta_id: { type: 'integer', description: 'ID de la cuenta liquida afectada. Opcional.' },
        descripcion: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Si se omite, usa hoy.' },
        deudor_nombre: { type: 'string', description: 'Para deuda_cobrar o deuda_pagar.' },
        fecha_esperada_pago: { type: 'string', description: 'YYYY-MM-DD para deudas.' }
      },
      required: ['tipo','monto']
    }
  },
  {
    name: 'consultar_movimientos',
    description: 'Consulta movimientos con filtros. Usar para responder preguntas tipo "cuanto gaste en X".',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string' },
        categoria_id: { type: 'integer' },
        cuenta_id: { type: 'integer' },
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'integer', description: 'Max filas, default 100' }
      }
    }
  },
  {
    name: 'editar_movimiento',
    description: 'Edita un movimiento existente. Solo enviar los campos que cambian.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        monto: { type: 'number' },
        tipo: { type: 'string' },
        categoria_id: { type: 'integer' },
        cuenta_id: { type: 'integer' },
        descripcion: { type: 'string' },
        fecha: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'borrar_movimiento',
    description: 'Borra un movimiento por ID. Solo tras confirmacion clara del usuario.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id']
    }
  }
];

async function ejecutarHerramienta(nombre, input) {
  if (nombre === 'listar_cuentas') {
    const { data: cuentas } = await supabase.from('finanzas_alejo_cuentas').select('*').eq('activa', true);
    const { data: movs } = await supabase.from('finanzas_alejo_movimientos').select('tipo, monto, cuenta_id');
    const saldos = {};
    for (const c of cuentas || []) saldos[c.id] = Number(c.saldo_inicial || 0);
    for (const m of movs || []) {
      if (!m.cuenta_id) continue;
      const delta = m.tipo === 'ingreso' || m.tipo === 'deuda_cobrar' ? Number(m.monto) : -Number(m.monto);
      saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) + delta;
    }
    return cuentas?.map(c => ({ ...c, saldo_actual: saldos[c.id] })) || [];
  }

  if (nombre === 'listar_categorias') {
    const { data } = await supabase.from('finanzas_alejo_categorias').select('*').order('nombre');
    return data || [];
  }

  if (nombre === 'crear_categoria') {
    const { data, error } = await supabase
      .from('finanzas_alejo_categorias')
      .insert({ nombre: input.nombre })
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'registrar_movimiento') {
    const row = {
      tipo: input.tipo,
      monto: input.monto,
      categoria_id: input.categoria_id || null,
      cuenta_id: input.cuenta_id || null,
      descripcion: input.descripcion || null,
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      deudor_nombre: input.deudor_nombre || null,
      fecha_esperada_pago: input.fecha_esperada_pago || null
    };
    const { data, error } = await supabase
      .from('finanzas_alejo_movimientos')
      .insert(row)
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'consultar_movimientos') {
    let q = supabase.from('finanzas_alejo_movimientos').select('*').order('fecha', { ascending: false });
    if (input.tipo) q = q.eq('tipo', input.tipo);
    if (input.categoria_id) q = q.eq('categoria_id', input.categoria_id);
    if (input.cuenta_id) q = q.eq('cuenta_id', input.cuenta_id);
    if (input.desde) q = q.gte('fecha', input.desde);
    if (input.hasta) q = q.lte('fecha', input.hasta);
    q = q.limit(input.limit || 100);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'editar_movimiento') {
    const { id, ...campos } = input;
    const { data, error } = await supabase
      .from('finanzas_alejo_movimientos')
      .update(campos)
      .eq('id', id)
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'borrar_movimiento') {
    const { error } = await supabase
      .from('finanzas_alejo_movimientos')
      .delete()
      .eq('id', input.id);
    if (error) return { error: error.message };
    return { ok: true, id: input.id };
  }

  return { error: `Herramienta desconocida: ${nombre}` };
}

function buildSystemPrompt() {
  const hoy = new Date().toISOString().slice(0, 10);
  return `Eres el asesor financiero personal de Alejo Plata, socio de Los Plata SAS (empresa de rifas en Colombia).

FECHA DE HOY: ${hoy}
MONEDA: COP (pesos colombianos). Siempre formatea montos con separador de miles y signo $, ej: $1.250.000.

ROL:
- Registras sus movimientos financieros y le das consejos.
- Tus respuestas son cortas, directas, en español colombiano informal (tuteo).
- No uses emojis. No uses encabezados tipo markdown ni tablas. Respuestas en prosa simple.

REGLAS DE REGISTRO:
- Cuando Alejo describe un movimiento, primero llama listar_categorias y listar_cuentas si las necesitas. Reutiliza categorias existentes: si dice "cafe" y ya existe "Cafe", NO crees "cafes". Reviso semanticamente (singular/plural, sinonimos obvios).
- Para gastos/ingresos: infiere la categoria. Si no calza en ninguna, crea una con crear_categoria.
- Para DEUDAS (cobrar o pagar): antes de registrar, PREGUNTA a Alejo de que cuenta sale o entra la plata (si aplica). No asumas.
- Para COMPRA DE ACTIVOS (oro, CDT, carro, inmueble): antes de registrar, CONFIRMA con Alejo que vas a hacer dos registros: un gasto desde la cuenta indicada + alta del activo. No procedas sin confirmacion.
- Cuando registras, responde con UN RESUMEN corto de lo hecho: "Registre gasto de $18.000 en Comida".
- Si el usuario cambia de opinion o te dice "borra el ultimo", usa borrar_movimiento tras confirmar.

REGLAS DE CONSULTA:
- Para preguntas tipo "cuanto gaste en X", usa consultar_movimientos. Nunca inventes cifras.
- Para preguntas de opinion ("me compro los tenis?"), primero consulta saldo y movimientos recientes, despues da tu criterio con datos reales.

No mientas. Si no tienes el dato, dilo.`;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Metodo no permitido' });

  const { contrasena, mensaje, historial } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const nombreLower = nombreAsesor.toLowerCase().trim();
  if (nombreLower !== 'alejo p' && nombreLower !== 'alejo plata') {
    return res.status(403).json({ status: 'error', mensaje: 'Acceso restringido' });
  }

  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ status: 'error', mensaje: 'Falta mensaje' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ status: 'error', mensaje: 'API key no configurada' });

  const mensajes = [];
  if (Array.isArray(historial)) {
    for (const h of historial) {
      if (h.rol === 'user' || h.rol === 'assistant') {
        mensajes.push({ role: h.rol, content: h.contenido });
      }
    }
  }
  mensajes.push({ role: 'user', content: mensaje });

  const toolCallsHechas = [];
  let respuestaFinal = '';

  try {
    for (let turno = 0; turno < MAX_TURNS; turno++) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          system: buildSystemPrompt(),
          tools: TOOLS,
          messages: mensajes
        })
      });

      const data = await resp.json();

      if (data.type === 'error') {
        return res.status(500).json({ status: 'error', mensaje: data.error?.message || 'Error en Claude' });
      }

      mensajes.push({ role: 'assistant', content: data.content });

      const toolUses = (data.content || []).filter(b => b.type === 'tool_use');
      const textos = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

      if (toolUses.length === 0) {
        respuestaFinal = textos;
        break;
      }

      const toolResults = [];
      for (const tu of toolUses) {
        const resultado = await ejecutarHerramienta(tu.name, tu.input || {});
        toolCallsHechas.push({ nombre: tu.name, input: tu.input, resultado });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(resultado)
        });
      }

      mensajes.push({ role: 'user', content: toolResults });

      if (textos && !respuestaFinal) respuestaFinal = textos;
    }

    // Guardar en tabla de chat para auditoria
    await supabase.from('finanzas_alejo_chat').insert([
      { rol: 'user', contenido: mensaje },
      { rol: 'assistant', contenido: respuestaFinal || '(sin respuesta)' }
    ]);

    return res.status(200).json({
      status: 'ok',
      respuesta: respuestaFinal,
      herramientas_usadas: toolCallsHechas.map(t => t.nombre)
    });

  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message || 'Error interno' });
  }
}
