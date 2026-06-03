/**
 * Cabina de control del Agente de IA (configuración por línea).
 *
 * SOLO GERENCIA. Aquí NO vive el "motor" del agente (eso será otro archivo);
 * esto solo LEE y GUARDA su configuración para la pestaña "Agente" de la bandeja:
 *   config      → devuelve { config, herramientas, actividad } de una línea
 *                 (siembra la config por defecto y las herramientas la 1ª vez)
 *   guardar     → { estado, nombre_agente, prompt, modelo }
 *   herramienta → { clave, activa }   (prende/apaga una acción)
 *
 * Recibe (POST, JSON): { contrasena, accion, linea_id, ... }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { esGerencia, puedeVerLinea } from '../lib/asesores.js';

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

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  // La cabina del agente es SOLO para gerencia (define cómo se atiende al cliente).
  if (!esGerencia(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede configurar el agente.' });
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

    return res.status(200).json({ status: 'error', mensaje: 'Acción no válida.' });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
