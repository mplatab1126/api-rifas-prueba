/**
 * GET /api/app/mis-boletas
 *
 * Devuelve todas las boletas del cliente autenticado.
 * Requiere token de sesion en el header Authorization.
 *
 * Usa la misma query que /api/cliente (que funciona correctamente).
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  // Validar sesion
  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const last10 = sesion.telefono.slice(-10);

  try {
    // Consultar boletas de la rifa de 4 cifras
    // Usando SOLO las columnas que sabemos que existen (mismas que /api/cliente)
    const { data: data4, error: error4 } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, total_abonado')
      .like('telefono_cliente', '%' + last10);

    if (error4) console.error('Error boletas 4:', error4);

    const PRECIO_BOLETA = 80000;

    const boletas = (data4 || []).map(b => ({
      numero: String(b.numero),
      tipo: '4cifras',
      tipo_label: 'Principal',
      rifa: 'La Perla Roja',
      precio_total: PRECIO_BOLETA,
      total_abonado: Number(b.total_abonado || 0),
      saldo_restante: Number(b.saldo_restante || 0),
      estado: Number(b.saldo_restante || 0) === 0 ? 'Pagada' : 'Pendiente',
    }));

    // Calcular totales
    const totalAbonado = boletas.reduce((s, b) => s + b.total_abonado, 0);
    const totalPendiente = boletas.reduce((s, b) => s + b.saldo_restante, 0);

    res.status(200).json({
      cliente: {
        nombre: sesion.nombre,
        telefono: sesion.telefono,
      },
      boletas,
      resumen: {
        total_boletas: boletas.length,
        total_abonado: totalAbonado,
        total_pendiente: totalPendiente,
      },
    });

  } catch (error) {
    console.error('Error en mis-boletas:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}
