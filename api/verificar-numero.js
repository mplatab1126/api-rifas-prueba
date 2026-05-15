/**
 * Verifica si un número específico de boleta (4 cifras) está disponible.
 *
 * Este endpoint lo consume el agente de IA "Camila v2" desde Chatea Pro,
 * cuando un cliente pregunta por un número puntual (ej: "¿Está el 2032?").
 * La IA llama a la función `verificar_disponibilidad` con el número que
 * extrajo del mensaje del cliente, y ese flujo llega aquí.
 *
 * Uso:
 *   GET /api/verificar-numero?numero=2032
 *
 * Respuestas posibles (todas con status 200 para que Chatea Pro las lea):
 *   - Número válido y disponible:
 *       { numero: "2032", disponible: true,  mensaje: "¡Sí! ..." }
 *   - Número válido pero ya vendido/apartado:
 *       { numero: "2032", disponible: false, mensaje: "El número ..." }
 *   - Número no existe en la rifa actual:
 *       { numero: "2032", disponible: false, mensaje: "No está en la rifa" }
 *   - Número con formato inválido (no 4 dígitos):
 *       { numero: "...",  disponible: false, mensaje: "No es válido..." }
 *
 * IMPORTANTE: este endpoint NO modifica nada en la base de datos.
 * Es solo lectura. No puede romper la venta de boletas ni el endpoint
 * /api/disponibles que sigue trabajando independiente.
 */
import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  try {
    const numero = req.query.numero;

    // Validación 1: debe venir el parámetro
    if (!numero) {
      return res.status(400).json({
        error: 'Falta el parámetro "numero". Ejemplo: /api/verificar-numero?numero=2032',
      });
    }

    // Validación 2: debe ser exactamente 4 dígitos (0000 - 9999)
    if (!/^\d{4}$/.test(numero)) {
      return res.status(200).json({
        numero,
        disponible: false,
        mensaje: `El número "${numero}" no parece válido. Los números de la rifa son de *4 cifras* (de 0000 a 9999).`,
      });
    }

    // Consulta a la base de datos (solo lectura)
    const { data, error } = await supabase
      .from('boletas')
      .select('numero, telefono_cliente')
      .eq('numero', numero)
      .maybeSingle();

    if (error) throw error;

    // Caso A: el número no existe en la rifa actual
    if (!data) {
      return res.status(200).json({
        numero,
        disponible: false,
        mensaje: `El número *${numero}* no está en la rifa de este momento.`,
      });
    }

    // Caso B: número disponible (sin cliente asignado)
    if (data.telefono_cliente === null) {
      return res.status(200).json({
        numero,
        disponible: true,
        mensaje: `¡Sí! El número *${numero}* está disponible. 🍀`,
      });
    }

    // Caso C: número ya apartado o vendido
    return res.status(200).json({
      numero,
      disponible: false,
      mensaje: `El número *${numero}* ya no está disponible. 😔`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
