/**
 * POST /api/app/enviar-notificacion
 *
 * Envia notificaciones push a todos los clientes con la app instalada.
 * Solo para admin (contrasena de asesor).
 *
 * Body: {
 *   contrasena: "xxx",
 *   titulo: "Resultado del sorteo!",
 *   mensaje: "El numero ganador es 1234",
 *   datos: { tipo: "resultado", ... }  // opcional, metadata
 * }
 *
 * Usa la API de Expo Push Notifications:
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  const { contrasena, titulo, mensaje, datos } = req.body;

  // Solo admin puede enviar notificaciones
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ error: 'Contrasena incorrecta' });

  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'Faltan titulo y mensaje' });
  }

  try {
    // Obtener todos los push tokens activos
    const { data: sesiones, error } = await supabase
      .from('sesiones_app')
      .select('push_token')
      .eq('activa', true)
      .not('push_token', 'is', null);

    if (error) throw error;

    const tokens = sesiones
      ?.map(s => s.push_token)
      .filter(t => t && t.startsWith('ExponentPushToken')) || [];

    if (tokens.length === 0) {
      return res.status(200).json({ enviados: 0, fallidos: 0, mensaje: 'No hay dispositivos registrados' });
    }

    // Construir mensajes para Expo Push API
    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title: titulo,
      body: mensaje,
      data: datos || {},
    }));

    // Enviar en lotes de 100 (limite de Expo)
    let enviados = 0;
    let fallidos = 0;

    for (let i = 0; i < messages.length; i += 100) {
      const lote = messages.slice(i, i + 100);

      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(lote),
      });

      const result = await resp.json();

      if (result.data) {
        for (const ticket of result.data) {
          if (ticket.status === 'ok') enviados++;
          else fallidos++;
        }
      }
    }

    res.status(200).json({ enviados, fallidos, total: tokens.length });

  } catch (error) {
    console.error('Error enviando notificaciones:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}
