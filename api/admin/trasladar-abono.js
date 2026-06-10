/**
 * Traslada abono de UNA boleta a OTRA boleta del MISMO cliente. Puede mover TODO el
 * abono o solo una PARTE (para dividir: ej. dejar $40.000 en una y pasar $20.000 a otra).
 *
 * Candado central (lo que pidió Mateo): ambas boletas deben pertenecer al teléfono del
 * cliente; NUNCA se mueve dinero hacia/desde la boleta de otro.
 *
 * Pasos:
 *  1. Valida que las dos boletas existan y sean del mismo cliente (su teléfono).
 *  2. Suma los abonos de la boleta origen y decide cuánto mover (todo o el monto pedido).
 *  3. Verifica que ese monto no exceda lo que falta en la boleta destino.
 *  4. Mueve los abonos: enteros hasta completar el monto; el último se PARTE si hace falta.
 *  5. Recalcula los saldos de AMBAS boletas desde sus abonos (la verdad).
 *  6. Reapunta cada transferencia del banco según en qué boleta(s) quedó.
 *  7. Deja constancia en la bitácora.
 *
 * Recibe (POST, JSON): { numeroOrigen, numeroDestino, telefono, contrasena, monto? }
 *   monto opcional: cuánto mover. Si no viene (o es >= al total), mueve TODO el abono.
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { esMismoTelefono } from '../lib/telefono.js';
import { validarAsesor } from '../lib/auth.js';
import { esGerencia } from '../lib/asesores.js';
import { PRECIOS } from '../config/precios.js';

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { numeroOrigen, numeroDestino, telefono, contrasena, monto, asesorRegistro } = req.body || {};
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  // Quién queda registrado en la bitácora (ej. el agente Liliana). Solo gerencia puede usar el override.
  const asesorReg = (asesorRegistro && esGerencia(nombreAsesor)) ? String(asesorRegistro).trim() : nombreAsesor;

  const origen = String(numeroOrigen || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const destino = String(numeroDestino || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  if (!/^\d{4}$/.test(origen) || !/^\d{4}$/.test(destino)) {
    return res.status(400).json({ status: 'error', mensaje: 'Números de boleta inválidos.' });
  }
  if (origen === destino) return res.status(400).json({ status: 'error', mensaje: 'La boleta de origen y destino son la misma.' });

  const last10 = String(telefono || '').replace(/\D/g, '').slice(-10);
  if (!last10) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente.' });

  try {
    // Monto pedido (parcial): se valida el formato aquí; el resto de validaciones
    // (mismo cliente, total disponible, tope del destino) vive DENTRO de la función
    // transaccional, leyendo los datos en la misma transacción.
    let montoPedido = null;
    if (monto != null && monto !== '') {
      montoPedido = Math.round(Number(String(monto).replace(/[^\d.-]/g, '')));
      if (!(montoPedido > 0)) return res.status(400).json({ status: 'error', mensaje: 'El monto a trasladar debe ser mayor a cero.' });
    }

    // H70: pre-chequeo de dueño con la regla de "cola mutua" — la RPC valida por sufijo de
    // 10 dígitos, que no distingue la cruzada entre países (+1 305xxx vs 57 305xxx) ni a un
    // extranjero corto. Si detectamos positivamente que alguna boleta NO es de este teléfono,
    // se frena aquí; los demás casos (no existe, etc.) los resuelve la RPC como siempre.
    const { data: duenos } = await supabase.from('boletas')
      .select('numero, telefono_cliente').in('numero', [origen, destino]);
    const ajenas = (duenos || []).filter(b => b.telefono_cliente && !esMismoTelefono(b.telefono_cliente, telefono));
    if (ajenas.length) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo se puede trasladar entre boletas del mismo cliente. La boleta ' + ajenas[0].numero + ' no está a su nombre.' });
    }

    // TODO el traslado (validar + mover/partir abonos + recalcular ambos saldos +
    // reapuntar transferencias) ocurre en UNA transacción en la base
    // (`trasladar_abono_atomico`, ver sql/trasladar-abono-atomico.sql): si algo
    // falla a mitad, no queda NADA a medias. Antes eran 7 pasos sueltos (H37).
    const { data: r, error: errRpc } = await supabase.rpc('trasladar_abono_atomico', {
      p_origen: origen,
      p_destino: destino,
      p_last10: last10,
      p_monto: montoPedido,
      p_precio_default: PRECIOS.RIFA_4_CIFRAS,
    });
    if (errRpc) throw errRpc;

    if (!r || r.ok !== true) {
      const codigo = r && r.codigo;
      if (codigo === 'NO_EXISTE') return res.status(404).json({ status: 'error', mensaje: 'Una de las boletas no existe.' });
      if (codigo === 'OTRO_CLIENTE') return res.status(403).json({ status: 'error', mensaje: 'Solo se puede trasladar entre boletas del mismo cliente. Una de las dos no está a su nombre.' });
      if (codigo === 'SIN_ABONOS') return res.status(400).json({ status: 'error', mensaje: `La boleta ${origen} no tiene abonos para trasladar.` });
      if (codigo === 'MONTO_INVALIDO') return res.status(400).json({ status: 'error', mensaje: 'El monto a trasladar debe ser mayor a cero.' });
      if (codigo === 'EXCEDE_TOTAL') return res.status(400).json({ status: 'error', mensaje: `La boleta ${origen} solo tiene ${fmt(r.total)} abonados; no puedes trasladar ${fmt(r.monto)}.` });
      if (codigo === 'EXCEDE_DESTINO') return res.status(400).json({ status: 'error', mensaje: `Ese abono (${fmt(r.monto)}) supera lo que falta en la boleta ${destino} (${fmt(r.saldo)}). Ajusta el monto.` });
      return res.status(500).json({ status: 'error', mensaje: 'El traslado no se pudo completar (respuesta inesperada de la base).' });
    }

    // Bitácora (fuera de la transacción, igual que antes: es solo el registro del movimiento)
    await supabase.from('registro_movimientos').insert({
      asesor: asesorReg, accion: 'Traslado de abono', boleta: destino,
      detalle: `Trasladó ${fmt(r.monto)} de la boleta ${origen} a la ${destino} (mismo cliente, tel ...${last10})`,
    });

    return res.status(200).json({ status: 'ok', mensaje: 'Abono trasladado', monto: Number(r.monto), total: Number(r.total), origen, destino });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
