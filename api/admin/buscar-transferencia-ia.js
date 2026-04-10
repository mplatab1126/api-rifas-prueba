import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { datos_ia, telefono_cliente, contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  if (!datos_ia || !datos_ia.monto) return res.status(400).json({ status: 'error', mensaje: 'Faltan datos del pago' });

  const { monto, fecha_pago, hora_pago, referencia, plataforma } = datos_ia;

  try {
    // DESCARGA MAESTRA: Traemos los pagos LIBRES de ese día y monto exacto
    const { data: candidatas, error } = await supabase
      .from('transferencias')
      .select('id, monto, fecha_pago, hora_pago, referencia, plataforma, estado, url_comprobante')
      .eq('estado', 'LIBRE')
      .eq('fecha_pago', fecha_pago)
      .eq('monto', Number(monto));

    if (error) throw error;
    if (!candidatas || candidatas.length === 0) {
      // Diagnóstico: buscar la misma transferencia en cualquier estado usando matching por hora
      const { data: todas } = await supabase
        .from('transferencias')
        .select('id, monto, fecha_pago, hora_pago, referencia, plataforma, estado')
        .eq('fecha_pago', fecha_pago)
        .eq('monto', Number(monto));

      if (todas && todas.length > 0) {
        // Aplicar misma lógica de matching para encontrar la correcta (no una al azar)
        let matchExacta = null;
        if (referencia && referencia !== '0') {
          const refLimpia = String(referencia).replace(/\D/g, '');
          matchExacta = todas.find(c => String(c.referencia).includes(referencia) || (refLimpia.length > 4 && String(c.referencia).includes(refLimpia)));
        }
        if (!matchExacta && hora_pago) {
          const horaMinuto = hora_pago.substring(0, 5);
          matchExacta = todas.find(c => c.hora_pago && c.hora_pago.startsWith(horaMinuto));
        }
        const t = matchExacta || todas[0];
        return res.status(404).json({
          status: 'error',
          mensaje: `La transferencia de $${monto} del ${fecha_pago} ya está en estado "${t.estado}" (Ref: ${t.referencia}). No puede reutilizarse.`
        });
      }

      // ¿Existe con fecha cercana (±1 día)?
      const fechaObj = new Date(fecha_pago + 'T12:00:00');
      const fechaAntes = new Date(fechaObj); fechaAntes.setDate(fechaAntes.getDate() - 1);
      const fechaDespues = new Date(fechaObj); fechaDespues.setDate(fechaDespues.getDate() + 1);
      const fA = fechaAntes.toISOString().split('T')[0];
      const fD = fechaDespues.toISOString().split('T')[0];

      const { data: cercanas } = await supabase
        .from('transferencias')
        .select('id, monto, fecha_pago, hora_pago, referencia, plataforma, estado')
        .in('fecha_pago', [fA, fD])
        .eq('monto', Number(monto));

      if (cercanas && cercanas.length > 0) {
        const t = cercanas[0];
        return res.status(404).json({
          status: 'error',
          mensaje: `Posible coincidencia: $${monto} encontrado el ${t.fecha_pago} (estado: ${t.estado}, ref: ${t.referencia}). La fecha del comprobante (${fecha_pago}) no coincide exactamente con la fecha guardada.`
        });
      }

      return res.status(404).json({ status: 'error', mensaje: `No hay pagos de $${monto} el ${fecha_pago}. Verifica que esté cargada con Carga IA.` });
    }

    let match = null;

    // 🛡️ INTENTO 1: Match por Referencia exacta o parcial (Nequi -> Nequi / Davivienda)
    if (referencia && referencia !== '0' && referencia.toLowerCase() !== 'sin ref') {
      const refLimpia = String(referencia).replace(/\D/g, '');
      match = candidatas.find(c => {
        const refBD = String(c.referencia);
        return refBD.includes(referencia) || (refLimpia.length > 4 && refBD.includes(refLimpia));
      });
    }

    // 🛡️ INTENTO 2: Monto + Hora Exacta (Minuto exacto) + Plataforma (Bancolombia -> Bancolombia)
    if (!match && hora_pago) {
      const horaMinuto = hora_pago.substring(0, 5); // Ej: "14:30"
      match = candidatas.find(c => {
          return c.hora_pago && c.hora_pago.startsWith(horaMinuto) && 
                 String(c.plataforma).toLowerCase().includes('bancolombia');
      });
    }

    // 🛡️ INTENTO 3: Ventana de Tolerancia (± 60 min) + Teléfono en Referencia (Nequi -> Bancolombia)
    if (!match && telefono_cliente && hora_pago) {
      const telLimpio = String(telefono_cliente).replace(/\D/g, '').slice(-10);
      const [hIA, mIA] = hora_pago.split(':').map(Number);
      const minTotalesIA = (hIA * 60) + mIA;

      match = candidatas.find(c => {
        if (!c.hora_pago || !c.referencia) return false;
        // 1. ¿Bancolombia guardó el celular en la referencia?
        if (!String(c.referencia).includes(telLimpio)) return false;
        // 2. ¿La hora tiene menos de 60 minutos de diferencia?
        const [hBD, mBD] = c.hora_pago.split(':').map(Number);
        const minTotalesBD = (hBD * 60) + mBD;
        const diferencia = Math.abs(minTotalesIA - minTotalesBD);
        return diferencia <= 60; 
      });
    }

    // 🛡️ INTENTO 4: Hora exacta (mismo minuto) con cualquier plataforma
    // Cubre el caso Nequi->Bancolombia cuando la plataforma guardada no es "Bancolombia"
    // (p.ej. el extracto decía "Transferencia nequi bancolombi" y la IA lo clasificó como "Nequi")
    if (!match && hora_pago) {
      const horaMinuto = hora_pago.substring(0, 5);
      match = candidatas.find(c => c.hora_pago && c.hora_pago.startsWith(horaMinuto));
    }

    if (match) {
      return res.status(200).json({ status: 'ok', transferencia: match });
    } else {
      return res.status(404).json({ status: 'error', mensaje: `Hay pagos de $${monto}, pero las referencias u horas no coinciden con este comprobante.` });
    }

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
