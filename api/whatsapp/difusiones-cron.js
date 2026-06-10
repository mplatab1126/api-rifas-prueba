/**
 * RELOJITO de las difusiones PROGRAMADAS.
 *
 * Lo llama un cron (pg_cron de Supabase) cada minuto. Hace dos cosas:
 *   1) Arranca las difusiones cuya hora programada ya llegó (estado 'programada' → 'enviando').
 *   2) Envía UN lote de cada difusión que esté 'enviando'. Como corre cada minuto, el envío
 *      sale por tandas (ritmo suave para que Meta no marque la línea). Si alguien deja una
 *      difusión a medias en el navegador, el cron la termina solo.
 *
 * El reclamo de cada lote es atómico (difusion_reclamar_lote), así que es seguro aunque el
 * navegador y el cron toquen la misma difusión a la vez: nadie se envía dos veces.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { esSecretoInternoValido } from '../lib/secreto-interno.js';
import { procesarLoteDifusion } from '../lib/difusion-envio.js';

const LOTE = 30;          // cuántos mensajes por corrida (cron cada minuto → ~30/min)
const MAX_DIFUSIONES = 10; // cuántas difusiones activas atiende por corrida

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  // Solo lo puede llamar quien tenga el secreto interno (el cron).
  const { interno } = req.body || {};
  if (!esSecretoInternoValido(interno)) {   // H39: secreto interno propio, comparación segura
    return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });
  }

  const ahora = new Date().toISOString();

  // 1) Arrancar las programadas que ya vencieron (su cola ya quedó armada al programarlas).
  const { data: programadas } = await supabaseAdmin
    .from('difusiones').select('id')
    .eq('estado', 'programada').lte('programada_at', ahora)
    .limit(MAX_DIFUSIONES);
  for (const d of (programadas || [])) {
    await supabaseAdmin.from('difusiones')
      .update({ estado: 'enviando', iniciada_at: ahora })
      .eq('id', d.id).eq('estado', 'programada');   // condicional: que no la arranque dos veces
  }

  // 2) Procesar un lote de cada difusión que esté enviando (incluye las recién arrancadas).
  const { data: enviando } = await supabaseAdmin
    .from('difusiones').select('id').eq('estado', 'enviando').limit(MAX_DIFUSIONES);

  let arrancadas = (programadas || []).length;
  const resultados = [];
  for (const d of (enviando || [])) {
    const r = await procesarLoteDifusion(d.id, { limite: LOTE, asesor: 'sistema' });
    resultados.push({ id: d.id, ...r });
  }

  return res.status(200).json({ status: 'ok', arrancadas, procesadas: resultados.length, resultados });
}
