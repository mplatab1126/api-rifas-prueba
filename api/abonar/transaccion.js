import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta id de transacción' });

  try {
    const r = await fetch(`https://production.wompi.co/v1/transactions/${encodeURIComponent(id)}`);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: 'No se pudo consultar la transacción', detalle: txt });
    }
    const json = await r.json();
    const tx = json && json.data ? json.data : null;
    if (!tx) return res.status(404).json({ error: 'Transacción no encontrada' });

    // Solo devolvemos lo necesario para la pantalla de éxito
    return res.status(200).json({
      id: tx.id,
      status: tx.status,
      reference: tx.reference,
      amountInCents: tx.amount_in_cents,
      monto: Math.floor(Number(tx.amount_in_cents || 0) / 100),
      paymentMethodType: tx.payment_method_type,
      finalizedAt: tx.finalized_at
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
