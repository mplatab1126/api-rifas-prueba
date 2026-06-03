/**
 * Cabina de control del Agente de IA (configuración por línea).
 *
 * SOLO GERENCIA. Aquí NO vive el "motor" del agente (eso será otro archivo);
 * esto solo LEE y GUARDA su configuración para la pestaña "Agente" de la bandeja:
 *   config      → devuelve { config, herramientas, actividad } de una línea
 *                 (siembra la config por defecto y las herramientas la 1ª vez)
 *   guardar     → { estado, nombre_agente, prompt, modelo }
 *   herramienta → { clave, activa }   (prende/apaga una acción)
 *   probar      → { mensajes:[{rol,texto}] } → respuesta del agente usando el
 *                 prompt YA guardado. Es un SIMULADOR: NO envía nada por WhatsApp,
 *                 solo devuelve el texto para que gerencia afine el prompt.
 *
 * Recibe (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { esMateo, puedeVerLinea } from '../lib/asesores.js';

const ESTADOS = ['apagado', 'sombra', 'encendido'];
const MODELOS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const MAX_PROMPT = 100000;   // el "manual" puede ser enorme (contexto de ~1M tokens)
const MAX_NOMBRE = 40;

// Herramientas por defecto, sembradas la 1ª vez que se abre una línea.
// Arrancan APAGADAS (activa:false); Mateo prende las que quiera, de a poco.
const HERRAMIENTAS_DEFAULT = [
  { clave: 'consultar_disponibles',    nombre: 'Consultar números disponibles',     descripcion: 'Mira en el sistema qué boletas están libres para ofrecerlas.',          riesgo: 'bajo',  orden: 1 },
  { clave: 'consultar_precio_premios', nombre: 'Consultar precio y premios',          descripcion: 'Informa el valor de la boleta y los premios de la rifa actual.',         riesgo: 'bajo',  orden: 2 },
  { clave: 'consultar_cliente',        nombre: 'Ver boletas y saldo de un cliente',   descripcion: 'Consulta las boletas, abonos y deuda de un cliente por su teléfono.',    riesgo: 'bajo',  orden: 3 },
  { clave: 'apartar_numero',           nombre: 'Apartar un número',                   descripcion: 'Reserva una boleta a nombre del cliente.',                              riesgo: 'medio', orden: 4 },
  { clave: 'enviar_boleta',            nombre: 'Enviar la boleta',                    descripcion: 'Manda al cliente su boleta digital.',                                   riesgo: 'medio', orden: 5 },
  { clave: 'registrar_abono',          nombre: 'Registrar un abono (dinero)',         descripcion: 'Registra un pago verificado contra una transferencia real del sistema.', riesgo: 'alto',  orden: 6 },
  { clave: 'pasar_a_humano',           nombre: 'Pasar la conversación a un asesor',   descripcion: 'Cuando no está seguro o el cliente lo pide, entrega el chat a una persona.', riesgo: 'bajo', orden: 7 },
];

// Devuelve la config de la línea; si no existe, la crea con valores por defecto.
async function asegurarConfig(lineaId) {
  const { data } = await supabase.from('agente_config').select('*').eq('linea_id', lineaId).maybeSingle();
  if (data) return data;
  const { data: nueva } = await supabaseAdmin
    .from('agente_config')
    .insert({ linea_id: lineaId })
    .select('*')
    .single();
  return nueva;
}

// Devuelve las herramientas de la línea; si no hay, siembra las de por defecto.
async function asegurarHerramientas(lineaId) {
  const cols = 'id, clave, nombre, descripcion, riesgo, activa, orden';
  let { data } = await supabase.from('agente_herramientas').select(cols).eq('linea_id', lineaId).order('orden', { ascending: true });
  if (!data || data.length === 0) {
    await supabaseAdmin.from('agente_herramientas').insert(HERRAMIENTAS_DEFAULT.map(h => ({ ...h, linea_id: lineaId })));
    const r2 = await supabase.from('agente_herramientas').select(cols).eq('linea_id', lineaId).order('orden', { ascending: true });
    data = r2.data;
  }
  return data || [];
}

// Texto corto con la fecha/hora de Colombia, para que el agente respete las
// reglas de fechas de sorteo y de horario al probarlo.
function contextoFechaHora() {
  const fecha = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota', weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return 'hoy es ' + fecha + ' (hora de Colombia)';
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  // El agente es por ahora EXCLUSIVO de Mateo (para evitar errores en pruebas).
  if (!esMateo(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo Mateo puede configurar el agente.' });
  if (!linea_id) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea.' });
  if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });

  try {
    if (accion === 'config') {
      const config = await asegurarConfig(linea_id);
      const herramientas = await asegurarHerramientas(linea_id);
      const { data: actividad } = await supabase
        .from('agente_actividad')
        .select('id, telefono, tipo, resumen, created_at')
        .eq('linea_id', linea_id)
        .order('created_at', { ascending: false })
        .limit(50);
      return res.status(200).json({ status: 'ok', config, herramientas, actividad: actividad || [] });
    }

    if (accion === 'guardar') {
      const estado = ESTADOS.includes(req.body.estado) ? req.body.estado : 'apagado';
      const modelo = MODELOS.includes(req.body.modelo) ? req.body.modelo : 'claude-sonnet-4-6';
      const prompt = String(req.body.prompt || '').slice(0, MAX_PROMPT);
      const nombre_agente = String(req.body.nombre_agente || '').trim().slice(0, MAX_NOMBRE) || null;
      await asegurarConfig(linea_id);   // garantiza que la fila exista
      const { data, error } = await supabaseAdmin
        .from('agente_config')
        .update({ estado, modelo, prompt, nombre_agente, actualizado_por: nombre, actualizado_at: new Date().toISOString() })
        .eq('linea_id', linea_id)
        .select('*')
        .single();
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', config: data });
    }

    if (accion === 'herramienta') {
      const clave = String(req.body.clave || '').trim();
      const activa = !!req.body.activa;
      if (!clave) return res.status(200).json({ status: 'error', mensaje: 'Falta la herramienta.' });
      const { error } = await supabaseAdmin
        .from('agente_herramientas')
        .update({ activa })
        .eq('linea_id', linea_id)
        .eq('clave', clave);
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok' });
    }

    // Prende/apaga el agente en UNA conversación (el botón 🤖 de la bandeja).
    if (accion === 'activar_conversacion') {
      const tel = String(req.body.telefono || '').trim();
      const activa = !!req.body.activa;
      if (!tel) return res.status(200).json({ status: 'error', mensaje: 'Falta el teléfono.' });
      const patch = { agente_activo: activa };
      if (activa) patch.estado = 'bot';
      const { error } = await supabaseAdmin
        .from('conversaciones_whatsapp')
        .update(patch)
        .eq('telefono', tel).eq('linea_id', linea_id);
      if (error) return res.status(200).json({ status: 'error', mensaje: error.message });
      return res.status(200).json({ status: 'ok', activa });
    }

    // Simulador: corre el prompt contra una conversación de prueba. NO toca WhatsApp.
    if (accion === 'probar') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(200).json({ status: 'error', mensaje: 'Falta la API Key de Anthropic en el servidor.' });

      const config = await asegurarConfig(linea_id);
      // Usa el prompt/modelo que venga del probador (lo que gerencia tiene escrito,
      // aunque no lo haya guardado todavía); si no viene, cae a lo guardado.
      const prompt = String(req.body.prompt != null ? req.body.prompt : (config.prompt || '')).trim().slice(0, MAX_PROMPT);
      if (!prompt) return res.status(200).json({ status: 'error', mensaje: 'Primero escribe las instrucciones del agente (arriba).' });
      const modelo = MODELOS.includes(req.body.modelo) ? req.body.modelo
        : (MODELOS.includes(config.modelo) ? config.modelo : 'claude-sonnet-4-6');

      // mensajes = [{ rol:'user'|'assistant', texto }]. Tomamos los últimos 30.
      const entrada = Array.isArray(req.body.mensajes) ? req.body.mensajes : [];
      const messages = entrada
        .filter(m => m && m.texto)
        .slice(-30)
        .map(m => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: String(m.texto).slice(0, 2000) }));
      if (!messages.length) return res.status(200).json({ status: 'error', mensaje: 'Escribe un mensaje de prueba.' });
      if (messages[messages.length - 1].role !== 'user') return res.status(200).json({ status: 'error', mensaje: 'El último mensaje debe ser del cliente.' });

      const system = prompt +
        '\n\n---\n(Nota interna: ' + contextoFechaHora() +
        '. Esto es una PRUEBA con un compañero del equipo; responde exactamente igual que con un cliente real.)';

      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelo, max_tokens: 800, system, messages }),
        });
        const data = await r.json();
        if (data.error) return res.status(200).json({ status: 'error', mensaje: 'IA: ' + (data.error.message || 'error') });
        const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return res.status(200).json({ status: 'ok', respuesta: texto || '(la IA no devolvió texto)' });
      } catch (e) {
        return res.status(200).json({ status: 'error', mensaje: 'No se pudo consultar la IA: ' + e.message });
      }
    }

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
