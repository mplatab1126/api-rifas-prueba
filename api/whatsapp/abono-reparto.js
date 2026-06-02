/**
 * Revisa (solo lectura) si un abono es parte de un pago REPARTIDO entre varias
 * boletas, para avisarle al asesor antes de borrarlo. No borra nada.
 *
 * Recibe (POST, JSON): { contrasena, id }
 * Devuelve: { reparto: bool, boletas: [...], cantidad, montoTotal }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, id } = req.body || {};
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!id) return res.status(400).json({ status: 'error', mensaje: 'Falta el id del abono.' });

  const { data: abono } = await supabase
    .from('abonos')
    .select('numero_boleta, referencia_transferencia, id_transferencia')
    .eq('id', id)
    .maybeSingle();
  if (!abono) return res.status(200).json({ status: 'ok', reparto: false });

  const numeroLimpio = String(abono.numero_boleta).trim();
  const ref = abono.referencia_transferencia;

  let transfer = null;
  if (abono.id_transferencia) {
    const { data } = await supabase.from('transferencias').select('id, estado').eq('id', abono.id_transferencia).maybeSingle();
    transfer = data;
  } else if (ref && !['Sin Ref', 'efectivo', 'efectivo_oficina', '0'].includes(ref)) {
    const { data } = await supabase.from('transferencias').select('id, estado').eq('referencia', ref).ilike('estado', 'ASIGNADA REPARTIDA%');
    transfer = (data || []).find(t => boletasDeEstado(t.estado).includes(numeroLimpio)) || null;
  }

  if (!transfer || !/^ASIGNADA REPARTIDA/i.test(transfer.estado || '')) {
    return res.status(200).json({ status: 'ok', reparto: false });
  }

  const boletas = boletasDeEstado(transfer.estado);
  const { data: partes } = await supabase
    .from('abonos')
    .select('monto')
    .in('numero_boleta', boletas)
    .eq('referencia_transferencia', ref);
  const montoTotal = (partes || []).reduce((s, p) => s + Number(p.monto || 0), 0);

  return res.status(200).json({ status: 'ok', reparto: true, boletas, cantidad: (partes || []).length, montoTotal });
}

function boletasDeEstado(estado) {
  const m = String(estado || '').match(/REPARTIDA:\s*(.+)/i);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}
