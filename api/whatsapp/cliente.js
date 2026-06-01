/**
 * Ficha del cliente para la bandeja: dado el teléfono de un chat, devuelve
 * quién es (nombre, ciudad, cédula), cuánto debe y sus boletas.
 *
 * Empareja por los últimos 10 dígitos del teléfono, así que funciona tenga o
 * no el código de país (57). Protegido con contraseña de asesor.
 *
 * Recibe (POST, JSON): { contrasena, telefono }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono } = req.body || {};
  if (!validarAsesor(contrasena)) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono.' });
  }

  const last10 = String(telefono).replace(/\D/g, '').slice(-10);

  const { data: boletas, error } = await supabase
    .from('boletas')
    .select('numero, saldo_restante, total_abonado, clientes (nombre, apellido, ciudad, documento_numero)')
    .like('telefono_cliente', '%' + last10);

  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  if (!boletas || boletas.length === 0) {
    return res.status(200).json({ status: 'ok', encontrado: false });
  }

  const cli = boletas[0].clientes || {};
  const deuda = boletas.reduce((s, b) => s + Number(b.saldo_restante || 0), 0);

  // Fecha del último abono entre todas sus boletas
  const numeros = boletas.map(b => b.numero);
  const { data: abonos } = await supabase
    .from('abonos')
    .select('fecha_pago')
    .in('numero_boleta', numeros)
    .order('fecha_pago', { ascending: false })
    .limit(1);

  return res.status(200).json({
    status: 'ok',
    encontrado: true,
    nombre: cli.nombre || '',
    apellido: cli.apellido || '',
    ciudad: cli.ciudad || '',
    documento: cli.documento_numero || '',
    deuda,
    ultimo_abono: abonos?.[0]?.fecha_pago || null,
    boletas: boletas
      .map(b => ({ numero: b.numero, saldo: Number(b.saldo_restante || 0), abonado: Number(b.total_abonado || 0) }))
      .sort((a, b) => a.numero - b.numero),
  });
}
