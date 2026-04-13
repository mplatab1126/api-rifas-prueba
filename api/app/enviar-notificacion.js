/**
 * POST /api/app/enviar-notificacion
 *
 * Endpoint INTERNO para que los asesores o el sistema envien
 * notificaciones a clientes de la app.
 *
 * Requiere la contraseña de asesores para autenticar.
 *
 * Body: {
 *   telefono: "573101234567",          — telefono del cliente
 *   tipo: "pago_registrado",           — tipo de notificacion
 *   titulo: "Pago registrado",         — titulo corto
 *   mensaje: "Se registro un abono..", — mensaje completo
 *   datos: { boleta: "0523" },         — datos extra (opcional, JSON)
 *   secreto: "clave_asesores"          — contraseña de seguridad
 * }
 *
 * Para enviar a TODOS los clientes con la app (ej: nueva rifa):
 * Body: {
 *   a_todos: true,
 *   tipo: "rifa_nueva",
 *   titulo: "Nueva rifa disponible!",
 *   mensaje: "...",
 *   secreto: "clave"
 * }
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS', 'Content-Type')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const { telefono, tipo, titulo, mensaje, datos, secreto, a_todos } = req.body;

  // Validar autenticacion
  const secretoValido = process.env.ASESORES_SECRETO;
  if (!secreto || secreto !== secretoValido) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  if (!tipo || !titulo || !mensaje) {
    return res.status(400).json({ error: 'Faltan tipo, titulo y mensaje' });
  }

  try {
    if (a_todos) {
      // Enviar a todos los clientes con sesion activa
      const { data: sesiones, error: errSesiones } = await supabase
        .from('sesiones_app')
        .select('telefono')
        .eq('activa', true);

      if (errSesiones) throw errSesiones;

      // Telefonos unicos
      const telefonos = [...new Set((sesiones || []).map(s => s.telefono))];

      if (telefonos.length === 0) {
        return res.status(200).json({ enviadas: 0, mensaje: 'No hay clientes con sesion activa' });
      }

      // Insertar notificaciones en lote
      const notificaciones = telefonos.map(tel => ({
        telefono: tel,
        tipo,
        titulo,
        mensaje,
        datos: datos || null,
      }));

      const { error: errInsert } = await supabase
        .from('notificaciones_app')
        .insert(notificaciones);

      if (errInsert) throw errInsert;

      return res.status(200).json({ enviadas: telefonos.length });
    }

    // Enviar a un cliente especifico
    if (!telefono) {
      return res.status(400).json({ error: 'Falta el telefono del cliente' });
    }

    const telefonoLimpio = limpiarTelefono(telefono);

    const { error: errInsert } = await supabase
      .from('notificaciones_app')
      .insert({
        telefono: telefonoLimpio,
        tipo,
        titulo,
        mensaje,
        datos: datos || null,
      });

    if (errInsert) throw errInsert;

    res.status(200).json({ enviada: true, telefono: telefonoLimpio });

  } catch (error) {
    console.error('Error en enviar-notificacion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
