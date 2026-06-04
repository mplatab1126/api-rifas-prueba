/**
 * RELOJITO de los recordatorios del agente.
 *
 * Lo llama un cron (pg_cron de Supabase) cada minuto. Busca los recordatorios
 * que YA vencieron y siguen pendientes (el índice parcial hace esto instantáneo,
 * aunque haya millones guardados), los "reclama" uno por uno de forma atómica
 * (para que NO se disparen dos veces si dos corridas se cruzan) y despierta al
 * motor del agente para que escriba el seguimiento.
 *
 * Recibe (POST, JSON): { interno }  (el secreto interno = WHATSAPP_VERIFY_TOKEN)
 */

import { aplicarCors } from '../lib/cors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { configWhatsapp } from '../lib/whatsapp.js';

const LOTE = 40;   // cuántos recordatorios procesa por corrida (escala: el cron corre cada minuto)
const BASE_URL = 'https://www.losplata.com.co';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  // Solo lo puede llamar quien tenga el secreto interno (el cron).
  const { interno } = req.body || {};
  const { verifyToken } = configWhatsapp();
  if (!verifyToken || interno !== verifyToken) {
    return res.status(403).json({ status: 'error', mensaje: 'No autorizado.' });
  }

  const ahora = new Date().toISOString();

  // Recordatorios vencidos y pendientes (lee SOLO esos gracias al índice parcial).
  const { data: vencidos, error } = await supabaseAdmin
    .from('recordatorios')
    .select('id, linea_id, telefono, motivo')
    .eq('estado', 'pendiente')
    .lte('programado_para', ahora)
    .order('programado_para', { ascending: true })
    .limit(LOTE);
  if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

  const tareas = [];
  let disparados = 0;
  for (const r of (vencidos || [])) {
    // "Reclamar" de forma atómica: pasarlo a 'enviado' SOLO si sigue 'pendiente'.
    // Si otra corrida ya se lo llevó, esta no recibe fila y lo salta (sin doble envío).
    const { data: claim } = await supabaseAdmin
      .from('recordatorios')
      .update({ estado: 'enviado', enviado_at: new Date().toISOString() })
      .eq('id', r.id).eq('estado', 'pendiente')
      .select('id').maybeSingle();
    if (!claim) continue;

    // Despertar al motor del agente (fire-and-forget, igual que el webhook): cada uno
    // sigue trabajando en su propia ejecución serverless.
    tareas.push(
      fetch(`${BASE_URL}/api/whatsapp/agente-responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefono: r.telefono, linea_id: r.linea_id, interno: verifyToken,
          recordatorio: { motivo: r.motivo || '' },
        }),
        signal: AbortSignal.timeout(1500),
      }).catch(() => {})
    );
    disparados++;
  }

  // Esperamos a que SALGAN las peticiones (cada una se corta a 1.5s), no a que terminen.
  await Promise.allSettled(tareas);

  return res.status(200).json({ status: 'ok', disparados });
}
