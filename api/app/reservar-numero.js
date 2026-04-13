/**
 * POST /api/app/reservar-numero
 *
 * Permite a un cliente autenticado reservar un numero de boleta
 * directamente desde la app.
 *
 * Body: {
 *   numero: "0523",
 *   tipo: "4cifras" | "2cifras" | "3cifras"
 * }
 *
 * Requiere token de sesion en Authorization header.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarSesionApp } from '../lib/auth-app.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const sesion = await validarSesionApp(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  const { numero, tipo } = req.body;
  if (!numero || !tipo) {
    return res.status(400).json({ error: 'Faltan numero y tipo' });
  }

  const tiposValidos = ['4cifras', '2cifras', '3cifras'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido. Usa: 4cifras, 2cifras o 3cifras' });
  }

  const tablas = {
    '4cifras': 'boletas',
    '2cifras': 'boletas_diarias',
    '3cifras': 'boletas_diarias_3cifras',
  };

  try {
    // 1. Verificar que el numero existe y esta disponible
    const { data: boleta, error: errBoleta } = await supabase
      .from(tablas[tipo])
      .select('numero, estado, precio_total')
      .eq('numero', numero)
      .single();

    if (errBoleta || !boleta) {
      return res.status(404).json({ error: 'Numero no encontrado' });
    }

    if (boleta.estado !== 'Disponible') {
      return res.status(409).json({ error: 'Este numero ya no esta disponible' });
    }

    // 2. Traer datos del cliente
    const last10 = sesion.telefono.slice(-10);
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, apellido, ciudad')
      .like('telefono', '%' + last10)
      .limit(1)
      .single();

    const nombreCompleto = cliente
      ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
      : sesion.nombre;

    // 3. Reservar la boleta
    const { error: errUpdate } = await supabase
      .from(tablas[tipo])
      .update({
        estado: 'Reservado',
        nombre_cliente: nombreCompleto,
        telefono_cliente: sesion.telefono,
        fecha_venta: new Date().toISOString().split('T')[0],
        asesor: 'App Movil',
      })
      .eq('numero', numero)
      .eq('estado', 'Disponible'); // Doble check para evitar race condition

    if (errUpdate) throw errUpdate;

    // 4. Registrar en movimientos
    await supabase.from('registro_movimientos').insert({
      asesor: 'App Movil',
      accion: 'Reserva App',
      boleta: numero,
      detalle: `${nombreCompleto} reservo boleta ${numero} (${tipo}) desde la app`,
    });

    // 5. Actualizar datos del cliente en tabla clientes
    const campoContador = tipo === '4cifras' ? 'boletas_grandes_compradas' : 'boletas_diarias_compradas';
    await supabase.rpc('incrementar_contador_cliente', {
      tel: sesion.telefono,
      campo: campoContador,
    }).catch(() => {
      // Si no existe la funcion RPC, hacer update manual
      // No es critico, el contador se puede actualizar despues
    });

    res.status(200).json({
      reservado: true,
      boleta: {
        numero,
        tipo,
        precio_total: Number(boleta.precio_total || 0),
        estado: 'Reservado',
        nombre_cliente: nombreCompleto,
      },
    });

  } catch (error) {
    console.error('Error en reservar-numero:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
