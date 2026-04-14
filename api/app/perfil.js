/**
 * GET /api/app/perfil
 *
 * Devuelve datos completos del cliente: info personal, estadisticas,
 * y historial de pagos recientes.
 * Requiere auth.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo no permitido' });

  const sesion = await validarSesionApp(req);
  if (!sesion) return res.status(401).json({ error: 'Sesion invalida' });

  const last10 = sesion.telefono.slice(-10);

  try {
    // Datos del cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, apellido, ciudad, telefono, total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    // Contar boletas activas por tipo
    const [b4, b2, b3] = await Promise.all([
      supabase.from('boletas').select('numero', { count: 'exact', head: true }).like('telefono_cliente', '%' + last10),
      supabase.from('boletas_diarias').select('numero', { count: 'exact', head: true }).like('telefono_cliente', '%' + last10),
      supabase.from('boletas_diarias_3cifras').select('numero', { count: 'exact', head: true }).like('telefono_cliente', '%' + last10),
    ]);

    // Historial de pagos (ultimos 20 abonos)
    // Primero necesitamos los numeros de boletas del cliente
    const { data: boletas4 } = await supabase
      .from('boletas')
      .select('numero')
      .like('telefono_cliente', '%' + last10);

    const numerosArray = (boletas4 || []).map(b => b.numero);

    let pagos = [];
    if (numerosArray.length > 0) {
      const { data: abonos } = await supabase
        .from('abonos')
        .select('numero_boleta, monto, fecha_pago, metodo_pago, referencia_transferencia')
        .in('numero_boleta', numerosArray)
        .order('fecha_pago', { ascending: false })
        .limit(20);

      pagos = abonos || [];
    }

    // Total abonado (sum de todos los abonos)
    const totalAbonado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);

    res.status(200).json({
      cliente: {
        nombre: cliente?.nombre || sesion.nombre,
        apellido: cliente?.apellido || '',
        ciudad: cliente?.ciudad || '',
        telefono: sesion.telefono,
      },
      estadisticas: {
        boletas_4cifras: b4.count || 0,
        boletas_2cifras: b2.count || 0,
        boletas_3cifras: b3.count || 0,
        total_boletas: (b4.count || 0) + (b2.count || 0) + (b3.count || 0),
        total_abonado: totalAbonado,
      },
      pagos,
    });

  } catch (error) {
    console.error('Error en perfil:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}
