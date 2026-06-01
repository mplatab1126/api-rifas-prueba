/**
 * FASE 1 (solo lectura): verificar un comprobante del cliente contra las
 * transferencias REALES del sistema. NO crea abonos ni transferencias.
 *
 * Flujo:
 *   1. Descarga la imagen que mandó el cliente (por media_id).
 *   2. La lee con IA y extrae monto, fecha, hora, referencia, plataforma.
 *   3. Busca en `transferencias` (TODOS los estados) las del mismo monto y la
 *      MISMA fecha (exacta).
 *   4. Sugiere la mejor coincidencia (referencia, hora exacta, teléfono).
 *   5. Muestra el estado de cada una: si ya está ASIGNADA, dice a qué boleta.
 *
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

    // 3. Mismo monto + MISMA fecha (exacta), TODOS los estados (libre o asignada)
    const { data: mismas } = await supabase
      .from('transferencias')
      .select('id, monto, fecha_pago, hora_pago, referencia, plataforma, estado, url_comprobante')
      .eq('monto', monto)
      .eq('fecha_pago', datos.fecha_pago);

    const todasDelDia = (mismas || []).map(c => ({
      ...c,
      libre: c.estado === 'LIBRE',
      boleta: boletaDeEstado(c.estado),
    }));

    // 4. EXACTITUD: de las del mismo monto y día, dejar SOLO las que realmente
    // coinciden con este comprobante (por referencia, mismo minuto, o teléfono).
    // Así no se muestran pagos de otra hora que solo comparten el monto.
    const candidatas = todasDelDia.filter(c => esCoincidencia(c, datos, last10));

    // Ordenar por cercanía de hora al comprobante (la más parecida primero)
    const horaRef = horaAMin(datos.hora_pago);
    candidatas.sort((a, b) => Math.abs(horaAMin(a.hora_pago) - horaRef) - Math.abs(horaAMin(b.hora_pago) - horaRef));

    // 5. Elegir la sugerida con las estrategias del Admin
    const sugerida = elegirSugerida(candidatas, datos, last10);

    // 6. Diagnóstico cuando no hay coincidencia exacta
    let diagnostico = null;
    if (candidatas.length === 0) {
      if (todasDelDia.length > 0) {
        diagnostico = `Hay ${todasDelDia.length} pago(s) de $${monto.toLocaleString('es-CO')} el ${datos.fecha_pago}, pero ninguno coincide en hora ni referencia con este comprobante. Revísalo a mano.`;
      } else {
        const { data: cercanas } = await supabase
          .from('transferencias')
          .select('estado, fecha_pago')
          .eq('monto', monto)
          .in('fecha_pago', vecinas(datos.fecha_pago))
          .limit(1);
        diagnostico = (cercanas && cercanas.length)
          ? `Hay un pago de $${monto.toLocaleString('es-CO')} pero el ${cercanas[0].fecha_pago} (1 día de diferencia con el comprobante). Revisa la fecha.`
          : `No hay ninguna transferencia real de $${monto.toLocaleString('es-CO')} el ${datos.fecha_pago}. Verifica que esté cargada con Carga IA.`;
      }
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

// "ASIGNADA a boleta 8732" -> "8732"; "ASIGNADA REPARTIDA: 8732, 8733" -> "8732, 8733"; LIBRE -> null
function boletaDeEstado(estado) {
  if (!estado || estado === 'LIBRE') return null;
  const rep = estado.match(/REPARTIDA:\s*(.+)/i);
  if (rep) return rep[1].trim();
  const uno = estado.match(/boleta\s+(\S+)/i);
  if (uno) return uno[1].trim();
  return estado; // por si hay otro formato, mostramos el estado tal cual
}

function horaAMin(v) {
  if (!v || !/^\d/.test(String(v))) return 1e9;
  const [h, m] = String(v).split(':').map(Number);
  return (h * 60) + (m || 0);
}

function vecinas(fecha) {
  try {
    const base = new Date(fecha + 'T12:00:00');
    const fmt = d => d.toISOString().split('T')[0];
    const antes = new Date(base); antes.setDate(antes.getDate() - 1);
    const despues = new Date(base); despues.setDate(despues.getDate() + 1);
    return [fmt(antes), fmt(despues)];
  } catch (_) { return []; }
}

// ¿Esta transferencia coincide DE VERDAD con el comprobante?
// Solo si: la referencia coincide, O el teléfono del cliente está en la
// referencia, O es el MISMO minuto exacto. Si no, no es la del cliente.
function esCoincidencia(c, datos, last10) {
  const { referencia, hora_pago } = datos;

  if (referencia && referencia !== '0' && String(referencia).toLowerCase() !== 'sin ref') {
    const refLimpia = String(referencia).replace(/\D/g, '');
    const refBD = String(c.referencia || '');
    if (refBD.includes(referencia) || (refLimpia.length > 4 && refBD.includes(refLimpia))) return true;
  }
  if (last10 && last10.length === 10 && String(c.referencia || '').includes(last10)) return true;
  if (hora_pago && c.hora_pago && c.hora_pago.substring(0, 5) === hora_pago.substring(0, 5)) return true;

  return false;
}

// Mismas estrategias que api/admin/buscar-transferencia-ia.js, en orden de confianza.
function elegirSugerida(candidatas, datos, last10) {
  if (!candidatas.length) return null;
  const { referencia, hora_pago } = datos;

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
    const hm = hora_pago.substring(0, 5);
    const m = candidatas.find(c => c.hora_pago && c.hora_pago.startsWith(hm) && String(c.plataforma).toLowerCase().includes('bancolombia'));
    if (m) { m._razon = 'Misma hora y plataforma'; return m; }
  }

  // 3. Teléfono del cliente dentro de la referencia + ventana de ±60 min
  if (last10 && hora_pago) {
    const [hIA, mIA] = hora_pago.split(':').map(Number);
    const minIA = (hIA * 60) + mIA;
    const m = candidatas.find(c => {
      if (!c.referencia || !String(c.referencia).includes(last10) || !c.hora_pago) return false;
      const [hBD, mBD] = c.hora_pago.split(':').map(Number);
      return Math.abs(minIA - ((hBD * 60) + mBD)) <= 60;
    });
    if (m) { m._razon = 'El celular del cliente está en la referencia'; return m; }
  }

  // 4. Hora exacta (mismo minuto), cualquier plataforma
  if (hora_pago) {
    const hm = hora_pago.substring(0, 5);
    const m = candidatas.find(c => c.hora_pago && c.hora_pago.startsWith(hm));
    if (m) { m._razon = 'Misma hora'; return m; }
  }

  return null;
}
