/**
 * Endpoint público: verifica si UN número específico de 4 cifras está
 * disponible en la rifa principal. Esto alimenta el buscador de la
 * página rifa.html ("¿Quieres un número específico? Escríbelo aquí").
 *
 * Acepta número en cualquier formato (ej: "25", "0025") y lo rellena
 * con ceros a la izquierda hasta 4 cifras.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  const { numero } = req.query;
  if (!numero) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el número.' });
  }

  // Limpiamos y rellenamos con ceros a la izquierda
  const limpio = String(numero).replace(/\D/g, '');
  if (limpio.length === 0 || limpio.length > 4) {
    return res.status(400).json({ status: 'error', mensaje: 'El número debe tener entre 1 y 4 dígitos.' });
  }
  const numeroFinal = limpio.padStart(4, '0');

  try {
    const { data, error } = await supabase
      .from('boletas')
      .select('numero, telefono_cliente, estado')
      .eq('numero', numeroFinal)
      .single();

    if (error || !data) {
      return res.status(200).json({
        status: 'ok',
        numero: numeroFinal,
        existe: false,
        disponible: false,
        mensaje: 'Ese número no existe en la rifa.'
      });
    }

    const disponible = !data.telefono_cliente;

    return res.status(200).json({
      status: 'ok',
      numero: numeroFinal,
      existe: true,
      disponible,
      mensaje: disponible
        ? `¡El número ${numeroFinal} está disponible!`
        : `El número ${numeroFinal} ya fue tomado por otro cliente.`
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
