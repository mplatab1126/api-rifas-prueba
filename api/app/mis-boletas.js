/**
 * GET /api/app/mis-boletas
 *
 * Devuelve todas las boletas del cliente autenticado (los 3 tipos).
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
    // Consultar los 3 tipos de boletas en paralelo
    // Usando SOLO las columnas que sabemos que existen (mismas que /api/cliente)
    const [res4, res2, res3] = await Promise.all([
      supabase
        .from('boletas')
        .select('numero, saldo_restante, total_abonado')
        .like('telefono_cliente', '%' + last10),

      supabase
        .from('boletas_diarias')
        .select('numero, saldo_restante, total_abonado')
        .like('telefono_cliente', '%' + last10),

      supabase
        .from('boletas_diarias_3cifras')
        .select('numero, saldo_restante, total_abonado')
        .like('telefono_cliente', '%' + last10),
    ]);

    // Log de errores para debug
    if (res4.error) console.error('Error boletas 4:', res4.error);
    if (res2.error) console.error('Error boletas 2:', res2.error);
    if (res3.error) console.error('Error boletas 3:', res3.error);

    // Precio fijo por tipo
    const PRECIOS = { 4: 80000, 2: 20000, 3: 5000 };

    // Unificar boletas con su tipo
    const boletas = [
      ...(res4.data || []).map(b => ({
        numero: String(b.numero),
        tipo: '4cifras',
        tipo_label: 'Principal',
        rifa: 'La Perla Roja',
        precio_total: PRECIOS[4],
        total_abonado: Number(b.total_abonado || 0),
        saldo_restante: Number(b.saldo_restante || 0),
        estado: Number(b.saldo_restante || 0) === 0 ? 'Pagada' : 'Pendiente',
      })),
      ...(res2.data || []).map(b => ({
        numero: String(b.numero),
        tipo: '2cifras',
        tipo_label: 'Diaria 2 cifras',
        rifa: 'Rifa Diaria',
        precio_total: PRECIOS[2],
        total_abonado: Number(b.total_abonado || 0),
        saldo_restante: Number(b.saldo_restante || 0),
        estado: Number(b.saldo_restante || 0) === 0 ? 'Pagada' : 'Pendiente',
      })),
      ...(res3.data || []).map(b => ({
        numero: String(b.numero),
        tipo: '3cifras',
        tipo_label: 'Diaria 3 cifras',
        rifa: 'Rifa Diaria',
        precio_total: PRECIOS[3],
        total_abonado: Number(b.total_abonado || 0),
        saldo_restante: Number(b.saldo_restante || 0),
        estado: Number(b.saldo_restante || 0) === 0 ? 'Pagada' : 'Pendiente',
      })),
    ];

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
