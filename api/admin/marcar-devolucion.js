import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

// Asesores autorizados para marcar transferencias como Devolución.
// Incluye los nombres internos alternos de cada persona.
const ASESORES_AUTORIZADOS = ['Juan Pablo Rojas', 'Juan Pablo', 'Mateo', 'Alejo P', 'Alejo Plata'];

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { idTransferencia, contrasena } = req.body;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  if (!ASESORES_AUTORIZADOS.includes(nombreAsesor)) {
    return res.status(403).json({ status: 'error', mensaje: '🚫 Solo Juan Pablo Rojas, Mateo o Alejandro pueden marcar devoluciones.' });
  }

  if (!idTransferencia) return res.status(400).json({ status: 'error', mensaje: 'Falta el id de la transferencia' });

  try {
    const { data: t, error: errBuscar } = await supabase
      .from('transferencias')
      .select('id, estado, monto, referencia, fecha_pago, plataforma')
      .eq('id', idTransferencia)
      .single();

    if (errBuscar || !t) {
      return res.status(404).json({ status: 'error', mensaje: 'No se encontró la transferencia' });
    }

    const estadoActual = String(t.estado || '').toUpperCase();

    if (estadoActual === 'DEVUELTA') {
      return res.status(400).json({ status: 'error', mensaje: '⚠️ Esta transferencia ya está marcada como Devolución.' });
    }

    if (estadoActual.includes('ASIGNADA')) {
      return res.status(400).json({
        status: 'error',
        mensaje: `🛑 Esta transferencia ya está ${t.estado}. Primero elimina ese abono y vuelve a intentar.`
      });
    }

    if (estadoActual !== 'LIBRE') {
      return res.status(400).json({
        status: 'error',
        mensaje: `🛑 Esta transferencia está en estado "${t.estado}". Solo se pueden devolver las LIBRES.`
      });
    }

    const { error: errUpdate } = await supabase
      .from('transferencias')
      .update({ estado: 'DEVUELTA' })
      .eq('id', idTransferencia);

    if (errUpdate) throw errUpdate;

    const fmt = new Intl.NumberFormat('es-CO').format(t.monto);
    await supabase.from('registro_movimientos').insert({
      asesor: nombreAsesor,
      accion: 'Marcar Devolución',
      boleta: '',
      detalle: `Devolución de $${fmt} en ${t.plataforma} (Ref: ${t.referencia}, Fecha: ${t.fecha_pago})`
    });

    return res.status(200).json({
      status: 'ok',
      mensaje: `✅ Transferencia de $${fmt} marcada como Devolución. Ya no se puede asignar a una boleta.`
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
