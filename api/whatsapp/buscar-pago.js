/**
 * FASE 1 (solo lectura): verificar un comprobante del cliente contra las
 * transferencias REALES del sistema. NO crea abonos ni transferencias.
 *
 * Flujo:
 *   1. Descarga la imagen que mandó el cliente (por media_id).
 *   2. La lee con IA y extrae monto, fecha, hora, referencia, plataforma.
 *   3. Busca en `transferencias` (estado LIBRE) las que coincidan en monto+fecha.
 *   4. Sugiere la mejor coincidencia usando las mismas estrategias que el Admin
 *      (referencia, hora exacta, teléfono del cliente en la referencia).
 *
 * Devuelve la lista de candidatas y cuál sugiere, para que el asesor decida.
 * El asesor SIEMPRE confirma; el sistema nunca abona solo.
 *
 * Recibe (POST, JSON): { contrasena, media_id, telefono }
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { descargarMediaBase64 } from '../lib/whatsapp.js';
import { extraerDatos } from '../lib/comprobante.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, media_id, telefono } = req.body || {};
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!media_id) return res.status(400).json({ status: 'error', mensaje: 'Falta el comprobante.' });

  // 1. Descargar la imagen del cliente
  const media = await descargarMediaBase64(media_id);
  if (!media.ok) return res.status(200).json({ status: 'error', mensaje: media.error });

  // 2. Leer el comprobante (solo extrae datos)
  const ext = await extraerDatos(media.base64, media.mimeType);
  if (!ext.ok) return res.status(200).json({ status: 'error', mensaje: ext.error });
  const datos = ext.datos;

  try {
    const monto = Number(datos.monto);
    const last10 = String(telefono || '').replace(/\D/g, '').slice(-10);
    const fechas = fechasCercanas(datos.fecha_pago); // [fecha-1, fecha, fecha+1]

    // 3. Candidatas reales LIBRES del mismo monto, fecha exacta o ±1 día
    const { data: libres } = await supabase
      .from('transferencias')
      .select('id, monto, fecha_pago, hora_pago, referencia, plataforma, estado, url_comprobante')
      .eq('estado', 'LIBRE')
      .eq('monto', monto)
      .in('fecha_pago', fechas);

    const candidatas = (libres || []).map(c => ({
      ...c,
      fecha_exacta: c.fecha_pago === datos.fecha_pago,
    }));

    // 4. Elegir la sugerida con las estrategias del Admin
    const sugerida = elegirSugerida(candidatas, datos, last10);

    // 5. Diagnóstico si no hay candidatas LIBRES (¿existe pero ya asignada?)
    let diagnostico = null;
    if (candidatas.length === 0) {
      const { data: todas } = await supabase
        .from('transferencias')
        .select('estado, referencia, fecha_pago')
        .eq('monto', monto)
        .in('fecha_pago', fechas)
        .limit(1);
      diagnostico = (todas && todas.length)
        ? `Existe un pago de $${monto.toLocaleString('es-CO')} (${todas[0].fecha_pago}) pero está en estado "${todas[0].estado}", no LIBRE.`
        : `No hay ninguna transferencia real de $${monto.toLocaleString('es-CO')} cerca del ${datos.fecha_pago}. Verifica que esté cargada con Carga IA.`;
    }

    return res.status(200).json({
      status: 'ok',
      extraido: datos,
      candidatas,
      sugerida_id: sugerida ? sugerida.id : null,
      razon_sugerida: sugerida ? sugerida._razon : null,
      diagnostico,
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}

// Devuelve [fecha-1, fecha, fecha+1] en formato YYYY-MM-DD
function fechasCercanas(fecha) {
  try {
    const base = new Date(fecha + 'T12:00:00');
    const fmt = d => d.toISOString().split('T')[0];
    const antes = new Date(base); antes.setDate(antes.getDate() - 1);
    const despues = new Date(base); despues.setDate(despues.getDate() + 1);
    return [fmt(antes), fecha, fmt(despues)];
  } catch (_) {
    return [fecha];
  }
}

// Mismas estrategias que api/admin/buscar-transferencia-ia.js, en orden de confianza.
// Marca _razon en la elegida para explicarle al asesor por qué la sugiere.
function elegirSugerida(candidatas, datos, last10) {
  if (!candidatas.length) return null;
  const { referencia, hora_pago, plataforma } = datos;

  // 1. Referencia exacta o parcial
  if (referencia && referencia !== '0' && String(referencia).toLowerCase() !== 'sin ref') {
    const refLimpia = String(referencia).replace(/\D/g, '');
    const m = candidatas.find(c => {
      const refBD = String(c.referencia || '');
      return refBD.includes(referencia) || (refLimpia.length > 4 && refBD.includes(refLimpia));
    });
    if (m) { m._razon = 'Coincide la referencia'; return m; }
  }

  // 2. Hora exacta (mismo minuto) + Bancolombia
  if (hora_pago) {
    const horaMinuto = hora_pago.substring(0, 5);
    const m = candidatas.find(c => c.hora_pago && c.hora_pago.startsWith(horaMinuto) && String(c.plataforma).toLowerCase().includes('bancolombia'));
    if (m) { m._razon = 'Misma hora y plataforma'; return m; }
  }

  // 3. Teléfono del cliente dentro de la referencia + ventana de ±60 min
  if (last10 && hora_pago) {
    const [hIA, mIA] = hora_pago.split(':').map(Number);
    const minIA = (hIA * 60) + mIA;
    const m = candidatas.find(c => {
      if (!c.referencia || !String(c.referencia).includes(last10)) return false;
      if (!c.hora_pago) return false;
      const [hBD, mBD] = c.hora_pago.split(':').map(Number);
      return Math.abs(minIA - ((hBD * 60) + mBD)) <= 60;
    });
    if (m) { m._razon = 'El celular del cliente está en la referencia'; return m; }
  }

  // 4. Hora exacta (mismo minuto) con cualquier plataforma
  if (hora_pago) {
    const horaMinuto = hora_pago.substring(0, 5);
    const m = candidatas.find(c => c.hora_pago && c.hora_pago.startsWith(horaMinuto));
    if (m) { m._razon = 'Misma hora'; return m; }
  }

  return null;
}
