import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { datos_ia, telefono_cliente, contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  if (!datos_ia || !datos_ia.monto) return res.status(400).json({ status: 'error', mensaje: 'Faltan datos del pago' });

  const { monto, fecha_pago, hora_pago, referencia, plataforma } = datos_ia;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
      return res.status(404).json({ status: 'error', mensaje: `No hay pagos LIBRES de $${monto} el ${fecha_pago}. Si el comprobante es de HOY, sincroniza Bancolombia primero.` });
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

    if (match) {
      return res.status(200).json({ status: 'ok', transferencia: match });
    } else {
      return res.status(404).json({ status: 'error', mensaje: `Hay pagos de $${monto}, pero las referencias u horas no coinciden con este comprobante.` });
    }

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
