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
  },
  {
    name: 'listar_activos',
    description: 'Lista los activos (oro, CDT, inmuebles, acciones, etc.) vigentes de Alejo. Por defecto trae solo los que aun tiene (activo=true). Usar antes de registrar uno nuevo o para consultar capital.',
    input_schema: {
      type: 'object',
      properties: {
        incluir_vendidos: { type: 'boolean', description: 'Si es true trae tambien los que ya vendio. Default false.' }
      }
    }
  },
  {
    name: 'registrar_activo',
    description: 'Registra un activo nuevo (oro, CDT, inmueble, etc). Este es el segundo paso de una compra de inversion: primero registras un gasto con registrar_movimiento (para descontar de la cuenta) y despues llamas esta herramienta para anotar que el activo existe. Devuelve el activo creado.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre claro del activo. Ej: "Cadena de oro 20g", "CDT Bancolombia 2025".' },
        tipo: { type: 'string', enum: ['oro','cdt','inmueble','accion','cripto','otro'], description: 'Categoria del activo.' },
        valor_compra: { type: 'number', description: 'Monto en COP que pago Alejo por el activo.' },
        fecha_compra: { type: 'string', description: 'YYYY-MM-DD. Si se omite, usa hoy.' },
        descripcion: { type: 'string', description: 'Notas libres (ej: 18k, 20 gramos, plazo 12 meses, etc.)' },
        movimiento_compra_id: { type: 'integer', description: 'ID del gasto correspondiente en finanzas_alejo_movimientos, si ya lo creaste.' }
      },
      required: ['nombre','tipo','valor_compra']
    }
  },
  {
    name: 'editar_activo',
    description: 'Actualiza un activo existente. Util para ajustar el valor_actual (ej: el oro subio de precio), corregir el nombre o la descripcion. Solo enviar los campos que cambian.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        nombre: { type: 'string' },
        tipo: { type: 'string' },
        valor_actual: { type: 'number', description: 'Nuevo valor de mercado del activo en COP.' },
        descripcion: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'vender_activo',
    description: 'Marca un activo como vendido. Debe ir acompañado ANTES de un registrar_movimiento tipo ingreso a la cuenta donde entra la plata. Marca activo=false, registra fecha_venta y valor_venta.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        valor_venta: { type: 'number', description: 'Monto en COP que recibio Alejo por vender el activo.' },
        fecha_venta: { type: 'string', description: 'YYYY-MM-DD. Si se omite, usa hoy.' },
        movimiento_venta_id: { type: 'integer', description: 'ID del ingreso correspondiente, si ya lo creaste.' }
      },
      required: ['id','valor_venta']
    }
  },
  {
    name: 'borrar_activo',
    description: 'Borra un activo por ID. Solo para corregir errores de registro. Si Alejo vendio el activo usa vender_activo, no borres. Pide confirmacion antes.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id']
    }
  },
  {
    name: 'generar_resumen_mensual',
    description: 'Devuelve el consolidado del mes: ingresos, gastos, ahorro, tasa de ahorro, top 5 categorias de gasto y comparacion con el mes anterior. Usar para "consejo del mes", "resumen del mes" o cualquier analisis de un mes.',
    input_schema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'YYYY-MM. Si se omite usa el mes actual.' }
      }
    }
  },
  {
    name: 'detectar_patrones',
    description: 'Analiza el mes actual contra los meses anteriores y devuelve: categorias cuyo gasto subio mas del 50% vs su promedio historico, y los gastos individuales mas grandes del mes. Usar para sugerir donde Alejo puede recortar.',
    input_schema: {
      type: 'object',
      properties: {
        meses_comparacion: { type: 'integer', description: 'Cuantos meses previos usar de base. Default 3.' }
      }
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

  if (nombre === 'listar_activos') {
    let q = supabase.from('finanzas_alejo_activos').select('*').order('fecha_compra', { ascending: false });
    if (!input.incluir_vendidos) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return data || [];
  }

  if (nombre === 'registrar_activo') {
    const row = {
      nombre: input.nombre,
      tipo: input.tipo,
      valor_compra: input.valor_compra,
      fecha_compra: input.fecha_compra || new Date().toISOString().slice(0, 10),
      descripcion: input.descripcion || null,
      movimiento_compra_id: input.movimiento_compra_id || null
    };
    const { data, error } = await supabase
      .from('finanzas_alejo_activos')
      .insert(row)
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'editar_activo') {
    const { id, ...campos } = input;
    campos.actualizado_en = new Date().toISOString();
    const { data, error } = await supabase
      .from('finanzas_alejo_activos')
      .update(campos)
      .eq('id', id)
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'vender_activo') {
    const { data, error } = await supabase
      .from('finanzas_alejo_activos')
      .update({
        activo: false,
        valor_venta: input.valor_venta,
        fecha_venta: input.fecha_venta || new Date().toISOString().slice(0, 10),
        movimiento_venta_id: input.movimiento_venta_id || null,
        actualizado_en: new Date().toISOString()
      })
      .eq('id', input.id)
      .select()
      .single();
    if (error) return { error: error.message };
    return data;
  }

  if (nombre === 'borrar_activo') {
    const { error } = await supabase
      .from('finanzas_alejo_activos')
      .delete()
      .eq('id', input.id);
    if (error) return { error: error.message };
    return { ok: true, id: input.id };
  }

  if (nombre === 'generar_resumen_mensual') {
    const mes = input.mes || new Date().toISOString().slice(0, 7);
    const [y, mo] = mes.split('-').map(Number);
    const inicioMes = new Date(y, mo - 1, 1).toISOString().slice(0, 10);
    const finMes = new Date(y, mo, 0).toISOString().slice(0, 10);
    const inicioMesPrev = new Date(y, mo - 2, 1).toISOString().slice(0, 10);
    const finMesPrev = new Date(y, mo - 1, 0).toISOString().slice(0, 10);

    const { data: movsPeriodo } = await supabase
      .from('finanzas_alejo_movimientos')
      .select('*')
      .gte('fecha', inicioMesPrev)
      .lte('fecha', finMes);

    let ingresosMes = 0, gastosMes = 0, ingresosPrev = 0, gastosPrev = 0;
    const gastosPorCatActual = {};
    for (const m of movsPeriodo || []) {
      const monto = Number(m.monto);
      const enActual = m.fecha >= inicioMes && m.fecha <= finMes;
      const enPrev = m.fecha >= inicioMesPrev && m.fecha <= finMesPrev;
      if (m.tipo === 'ingreso') {
        if (enActual) ingresosMes += monto;
        if (enPrev) ingresosPrev += monto;
      }
      if (m.tipo === 'gasto') {
        if (enActual) {
          gastosMes += monto;
          const c = m.categoria_id || 'sin';
          gastosPorCatActual[c] = (gastosPorCatActual[c] || 0) + monto;
        }
        if (enPrev) gastosPrev += monto;
      }
    }

    const ahorroMes = ingresosMes - gastosMes;
    const tasaAhorro = ingresosMes > 0 ? (ahorroMes / ingresosMes) * 100 : null;
    const ahorroPrev = ingresosPrev - gastosPrev;
    const tasaPrev = ingresosPrev > 0 ? (ahorroPrev / ingresosPrev) * 100 : null;

    const { data: cats } = await supabase.from('finanzas_alejo_categorias').select('*');
    const catMap = {};
    for (const c of cats || []) catMap[c.id] = c.nombre;
    const topCats = Object.entries(gastosPorCatActual)
      .map(([id, monto]) => ({
        categoria: id === 'sin' ? 'Sin categoria' : (catMap[id] || 'Sin categoria'),
        monto,
        porcentaje: gastosMes > 0 ? Math.round((monto / gastosMes) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    return {
      mes,
      ingresos: ingresosMes,
      gastos: gastosMes,
      ahorro: ahorroMes,
      tasa_ahorro_pct: tasaAhorro != null ? Math.round(tasaAhorro * 10) / 10 : null,
      top_categorias: topCats,
      mes_anterior: {
        mes: inicioMesPrev.slice(0, 7),
        ingresos: ingresosPrev,
        gastos: gastosPrev,
        ahorro: ahorroPrev,
        tasa_ahorro_pct: tasaPrev != null ? Math.round(tasaPrev * 10) / 10 : null
      },
      delta_vs_mes_anterior: {
        ingresos: ingresosMes - ingresosPrev,
        gastos: gastosMes - gastosPrev,
        ahorro: ahorroMes - ahorroPrev
      }
    };
  }

  if (nombre === 'detectar_patrones') {
    const mesesBase = Math.max(1, input.meses_comparacion || 3);
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
    const inicioPeriodoBase = new Date(hoy.getFullYear(), hoy.getMonth() - mesesBase, 1).toISOString().slice(0, 10);
    const finPeriodoBase = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10);

    const { data: movs } = await supabase
      .from('finanzas_alejo_movimientos')
      .select('id, fecha, tipo, monto, categoria_id, descripcion')
      .gte('fecha', inicioPeriodoBase);

    const gastosActualPorCat = {}, gastosBasePorCat = {};
    const gastosGrandes = [];
    const mesesConGastos = new Set();
    for (const m of movs || []) {
      if (m.tipo !== 'gasto') continue;
      const c = m.categoria_id || 'sin';
      const monto = Number(m.monto);
      if (m.fecha >= inicioMesActual) {
        gastosActualPorCat[c] = (gastosActualPorCat[c] || 0) + monto;
        if (monto >= 500000) gastosGrandes.push({ id: m.id, fecha: m.fecha, monto, categoria_id: m.categoria_id, descripcion: m.descripcion });
      } else if (m.fecha <= finPeriodoBase) {
        gastosBasePorCat[c] = (gastosBasePorCat[c] || 0) + monto;
        mesesConGastos.add(m.fecha.slice(0, 7));
      }
    }

    const baseMeses = Math.max(1, mesesConGastos.size);
    const { data: cats } = await supabase.from('finanzas_alejo_categorias').select('*');
    const catMap = {};
    for (const c of cats || []) catMap[c.id] = c.nombre;

    const subidas = [];
    const todasLasCats = new Set([...Object.keys(gastosActualPorCat), ...Object.keys(gastosBasePorCat)]);
    for (const cat of todasLasCats) {
      const actual = gastosActualPorCat[cat] || 0;
      const promedioBase = (gastosBasePorCat[cat] || 0) / baseMeses;
      if (promedioBase >= 50000 && actual > promedioBase * 1.5) {
        subidas.push({
          categoria: cat === 'sin' ? 'Sin categoria' : (catMap[cat] || 'Sin categoria'),
          gastado_este_mes: actual,
          promedio_meses_previos: Math.round(promedioBase),
          cambio_pct: Math.round(((actual - promedioBase) / promedioBase) * 100)
        });
      }
    }
    subidas.sort((a, b) => b.cambio_pct - a.cambio_pct);
    gastosGrandes.sort((a, b) => b.monto - a.monto);

    return {
      mes_analizado: inicioMesActual.slice(0, 7),
      meses_de_base: baseMeses,
      categorias_al_alza: subidas.slice(0, 5),
      gastos_grandes_mes_actual: gastosGrandes.slice(0, 8)
    };
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
- Para COMPRA DE ACTIVOS (oro, CDT, inmueble, accion, cripto): 1) PREGUNTA de que cuenta salio la plata si no te lo dijo. 2) Confirma con Alejo que haras dos pasos: un gasto + alta del activo. 3) Llama registrar_movimiento tipo gasto desde la cuenta. 4) Llama registrar_activo con el valor_compra y el tipo adecuado, pasando el movimiento_compra_id del paso 3. 5) Responde resumen: "Listo, registre gasto de $X y agregue la cadena de oro a tus activos".
- Para VENTA DE ACTIVOS: 1) Usa listar_activos para identificar cual. 2) PREGUNTA a que cuenta entra la plata y por cuanto vendio. 3) Llama registrar_movimiento tipo ingreso a la cuenta. 4) Llama vender_activo con valor_venta y movimiento_venta_id. 5) Menciona si gano o perdio frente al valor_compra.
- Para ACTUALIZAR VALOR de un activo (ej: "el oro ya vale 2M"), usa editar_activo con valor_actual. NO crees un movimiento: no hay plata moviendose.
- Cuando registras, responde con UN RESUMEN corto de lo hecho: "Registre gasto de $18.000 en Comida".
- Si el usuario cambia de opinion o te dice "borra el ultimo", usa borrar_movimiento tras confirmar.

REGLAS DE CONSULTA:
- Para preguntas tipo "cuanto gaste en X", usa consultar_movimientos. Nunca inventes cifras.
- Para preguntas sobre CAPITAL o INVERSIONES, usa listar_activos. El capital total es la suma de valor_actual (o valor_compra si no hay) de los activos con activo=true.
- Para preguntas de opinion ("me compro los tenis?"), primero consulta saldo y movimientos recientes, despues da tu criterio con datos reales.

CONSEJO DEL MES Y ANALISIS PROACTIVO:
- Cuando Alejo pida "consejo del mes", "resumen", "como voy" o pulse el boton de consejo: usa generar_resumen_mensual + detectar_patrones + listar_cuentas. Con eso te alcanza para una respuesta solida.
- Estructura tu respuesta corta y accionable: 1) Veredicto rapido del mes (estoy mejor o peor), 2) Patron mas notable (subida o bajada relevante), 3) Recomendacion concreta de accion para los proximos dias.
- Tasa de ahorro saludable: 20%+. Si esta por debajo, dilo y sugiere donde recortar usando los datos de detectar_patrones.
- No moralices ni inventes presupuestos genericos. Habla en plata real de Alejo.

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
