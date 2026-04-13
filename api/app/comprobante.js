/**
 * POST /api/app/comprobante
 *
 * Permite al cliente enviar un comprobante de pago desde la app.
 * El comprobante se guarda como una transferencia pendiente
 * que los asesores pueden asignar a una boleta.
 *
 * Body: {
 *   numero_boleta: "0523",          — numero de la boleta que quiere pagar
 *   tipo: "4cifras",                — tipo de boleta
 *   monto: 50000,                   — monto que pago
 *   plataforma: "Nequi",            — Nequi, Daviplata o Bancolombia
 *   referencia: "12345",            — referencia de la transferencia (opcional)
 *   fecha_pago: "2026-04-13",       — fecha del pago (opcional, default hoy)
 *   nota: "Pago desde Nequi"        — nota adicional (opcional)
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

  const { numero_boleta, tipo, monto, plataforma, referencia, fecha_pago, nota } = req.body;

  // Validaciones basicas
  if (!numero_boleta || !tipo || !monto || !plataforma) {
    return res.status(400).json({
      error: 'Faltan datos. Se necesita: numero_boleta, tipo, monto y plataforma'
    });
  }

  const tiposValidos = ['4cifras', '2cifras', '3cifras'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido' });
  }

  const plataformasValidas = ['Nequi', 'Daviplata', 'Bancolombia'];
  if (!plataformasValidas.includes(plataforma)) {
    return res.status(400).json({ error: 'Plataforma invalida. Usa: Nequi, Daviplata o Bancolombia' });
  }

  const montoNum = Number(monto);
  if (isNaN(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  }

  const last10 = sesion.telefono.slice(-10);

  const tablas = {
    '4cifras': 'boletas',
    '2cifras': 'boletas_diarias',
    '3cifras': 'boletas_diarias_3cifras',
  };

  try {
    // 1. Verificar que la boleta pertenece al cliente
    const { data: boleta, error: errBoleta } = await supabase
      .from(tablas[tipo])
      .select('numero, estado, saldo_restante, telefono_cliente')
      .eq('numero', numero_boleta)
      .single();

    if (errBoleta || !boleta) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    const telBoleta = String(boleta.telefono_cliente || '').replace(/\D/g, '').slice(-10);
    if (telBoleta !== last10) {
      return res.status(403).json({ error: 'Esta boleta no te pertenece' });
    }

    if (boleta.estado === 'Pagada') {
      return res.status(400).json({ error: 'Esta boleta ya esta completamente pagada' });
    }

    // 2. Verificar que no duplique referencia
    if (referencia && referencia !== '0') {
      const { data: existe } = await supabase
        .from('transferencias')
        .select('id')
        .eq('referencia', String(referencia))
        .limit(1);

      if (existe && existe.length > 0) {
        return res.status(409).json({
          error: 'Ya existe una transferencia con esa referencia'
        });
      }
    }

    // 3. Guardar como transferencia pendiente
    const fechaHoy = fecha_pago || new Date().toISOString().split('T')[0];

    const { error: errInsert } = await supabase
      .from('transferencias')
      .insert({
        plataforma,
        monto: montoNum,
        referencia: referencia || '0',
        fecha_pago: fechaHoy,
        hora_pago: new Date().toTimeString().split(' ')[0],
        estado: `PENDIENTE APP - Boleta ${numero_boleta} (${tipo})`,
      });

    if (errInsert) throw errInsert;

    // 4. Registrar en movimientos
    await supabase.from('registro_movimientos').insert({
      asesor: 'App Movil',
      accion: 'Comprobante App',
      boleta: numero_boleta,
      detalle: `Cliente envio comprobante: $${montoNum.toLocaleString()} por ${plataforma}${nota ? ' - ' + nota : ''}`,
    });

    // 5. Crear notificacion para que los asesores lo vean
    // (esto se maneja desde el panel admin, no desde la app)

    res.status(200).json({
      enviado: true,
      mensaje: 'Comprobante recibido. Un asesor revisara tu pago pronto.',
      datos: {
        numero_boleta,
        tipo,
        monto: montoNum,
        plataforma,
        referencia: referencia || null,
      },
    });

  } catch (error) {
    console.error('Error en comprobante:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
