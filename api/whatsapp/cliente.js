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
import { grupoDeAsesor } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, telefono } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) {
    return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  }
  if (!telefono) {
    return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono.' });
  }

  const last10 = String(telefono).replace(/\D/g, '').slice(-10);

  // Boletas de la RIFA ACTUAL de este teléfono (la tabla `boletas` es solo la
  // rifa vigente). Puede que el cliente no tenga ninguna.
  const { data: boletas, error } = await supabase
    .from('boletas')
    .select('numero, saldo_restante, total_abonado, asesor, clientes (nombre, apellido, ciudad, documento_numero, correo)')
    .like('telefono_cliente', '%' + last10);

  if (error) {
    return res.status(200).json({ status: 'error', mensaje: error.message });
  }

  // Datos del cliente en la base, aunque NO tenga boletas en la rifa actual
  // (clientes que ya dieron sus datos antes o que participaron en rifas pasadas).
  const { data: clientesRows } = await supabase
    .from('clientes')
    .select('nombre, apellido, ciudad, documento_numero, correo')
    .like('telefono', '%' + last10)
    .limit(1);

  const tieneBoletas = !!(boletas && boletas.length);
  const cli = (clientesRows && clientesRows[0]) || (tieneBoletas ? (boletas[0].clientes || {}) : null);
  const registrado = !!cli || tieneBoletas;

  // Cliente realmente nuevo: ni datos en la base ni boletas en la rifa actual.
  if (!registrado) {
    return res.status(200).json({ status: 'ok', encontrado: false, registrado: false, boletas: [] });
  }

  const deuda = (boletas || []).reduce((s, b) => s + Number(b.saldo_restante || 0), 0);

  // Boletas con su historial de pagos (solo si tiene boletas en la rifa actual).
  const boletasOut = [];
  if (tieneBoletas) {
    // Historial de pagos (abonos) de todas sus boletas, del más reciente al más viejo
    const numeros = boletas.map(b => b.numero);
    const { data: pagos } = await supabase
      .from('abonos')
      .select('id, numero_boleta, monto, fecha_pago, referencia_transferencia, metodo_pago, asesor')
      .in('numero_boleta', numeros)
      .order('fecha_pago', { ascending: false })
      .limit(100);

    // Agrupar los pagos por boleta
    const porBoleta = {};
    for (const p of (pagos || [])) {
      (porBoleta[p.numero_boleta] = porBoleta[p.numero_boleta] || []).push({
        id: p.id, monto: p.monto, fecha_pago: p.fecha_pago, referencia_transferencia: p.referencia_transferencia, metodo_pago: p.metodo_pago, asesor: p.asesor,
      });
    }

    // Permisos por grupo (igual que el Admin): un asesor solo puede MODIFICAR
    // boletas de su mismo grupo. Las de otro grupo se ven, pero en solo lectura.
    const grupoAsesor = await grupoDeAsesor(nombre);
    const cacheGrupo = {};
    const grupoDe = async (a) => {
      if (!a) return null;
      if (!(a in cacheGrupo)) cacheGrupo[a] = await grupoDeAsesor(a);
      return cacheGrupo[a];
    };

    for (const b of boletas) {
      const g = await grupoDe(b.asesor);
      boletasOut.push({
        numero: b.numero,
        saldo: Number(b.saldo_restante || 0),
        abonado: Number(b.total_abonado || 0),
        asesor: b.asesor || '',
        puede_modificar: !b.asesor || g === grupoAsesor,
        pagos: porBoleta[b.numero] || [],
      });
    }
    boletasOut.sort((a, b) => a.numero - b.numero);
  }

  return res.status(200).json({
    status: 'ok',
    encontrado: true,
    registrado: true,
    nombre: (cli && cli.nombre) || '',
    apellido: (cli && cli.apellido) || '',
    ciudad: (cli && cli.ciudad) || '',
    documento: (cli && cli.documento_numero) || '',
    correo: (cli && cli.correo) || '',
    deuda,
    boletas: boletasOut,
  });
}
