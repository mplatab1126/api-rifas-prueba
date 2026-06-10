import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { grupoDeAsesor, esGerencia } from '../lib/asesores.js';
import { PRECIOS } from '../config/precios.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { numeroBoleta, contrasena, asesorRegistro, soloSiSinAbonos, telefonoEsperado } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  // Quién queda registrado (ej. el agente Liliana). No cambia permisos: solo gerencia puede usarlo.
  const asesorReg = (asesorRegistro && esGerencia(nombreAsesor)) ? String(asesorRegistro).trim() : nombreAsesor;
  if (!numeroBoleta) return res.status(400).json({ status: 'error', mensaje: 'Falta el número de la boleta' });

  try {
    // A. Buscar los abonos de esta boleta para ver si usaron transferencias del banco
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('referencia_transferencia, monto')
      .eq('numero_boleta', numeroBoleta);

    if (errAbonos) throw errAbonos;

    // A2. AJUSTAR ESTADÍSTICAS DEL CLIENTE antes de borrar todo
    const { data: boletaActual } = await supabase
      .from('boletas')
      .select('telefono_cliente, saldo_restante, asesor')
      .eq('numero', numeroBoleta)
      .single();

    // Validar grupo de asesores: no puedes liberar boletas de otro grupo
    const asesorBoleta = boletaActual?.asesor || '';
    if (asesorBoleta) {
      // La validación de grupo sigue al ACTOR REAL (con override de gerencia, valida como "Liliana").
      const grupoAsesor = await grupoDeAsesor(asesorReg);
      const grupoBoleta = await grupoDeAsesor(asesorBoleta);
      if (grupoAsesor !== grupoBoleta) {
        return res.status(400).json({ status: 'error', mensaje: `🚫 Esta boleta pertenece al equipo "${grupoBoleta}". Tu equipo (${grupoAsesor}) no puede liberarla.` });
      }
    }

    if (boletaActual?.telefono_cliente) {
      const { data: clienteActual } = await supabase
        .from('clientes')
        .select('total_comprado, boletas_grandes_compradas')
        .eq('telefono', boletaActual.telefono_cliente)
        .single();

      if (clienteActual) {
        // Sumar montos de abonos que NO son premio_rifa_diaria.
        // Los abonos historicos marcados como premio nunca sumaron al total_comprado;
        // tampoco los restamos al liberar (preserva integridad de registros viejos)
        const montoARestar = (abonos || [])
          .filter(a => a.referencia_transferencia !== 'premio_rifa_diaria')
          .reduce((sum, a) => sum + Number(a.monto || 0), 0);

        const totalComprado = Math.max(0, (clienteActual.total_comprado || 0) - montoARestar);
        let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;

        // Si la boleta estaba pagada, restar 1 al contador
        if (boletaActual.saldo_restante <= 0) {
          grandesCompradas = Math.max(0, grandesCompradas - 1);
        }

        await supabase.from('clientes').update({
          total_comprado: totalComprado,
          boletas_grandes_compradas: grandesCompradas
        }).eq('telefono', boletaActual.telefono_cliente);
      }
    }

    // H68 (solo cuando llama el AGENTE, que manda estos parámetros): liberación ATÓMICA.
    // El candado "dueño correcto + $0 abonado" vivía solo en el llamador, y entre su lectura
    // y este borrado pasan segundos en los que el cron de verificación puede abonar. Un solo
    // UPDATE condicional ocupa la liberación ÚNICAMENTE si la boleta SIGUE sin un peso y
    // sigue siendo del cliente esperado; si no afecta filas, NO se borra nada.
    // El Admin humano (sin estos parámetros) funciona exactamente igual que siempre.
    if (soloSiSinAbonos) {
      const telDig = String(telefonoEsperado || '').replace(/\D/g, '');
      if (!telDig) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono esperado del cliente.' });
      const l10 = telDig.slice(-10);
      const { data: claim, error: errClaim } = await supabase
        .from('boletas')
        .update({ telefono_cliente: null, estado: 'LIBRE', total_abonado: 0, saldo_restante: PRECIOS.RIFA_4_CIFRAS })
        .eq('numero', numeroBoleta)
        .or('total_abonado.eq.0,total_abonado.is.null')
        .like('telefono_cliente', l10.length === 10 ? '%' + l10 : telDig)
        .select('numero');
      if (errClaim) throw errClaim;
      if (!claim || !claim.length) {
        return res.status(200).json({ status: 'error', mensaje: 'No se liberó: la boleta ya tiene abonos registrados o cambió de dueño. Revísala a mano antes de cancelar.' });
      }
    }

    // B. Liberar SOLO las transferencias asignadas a ESTA boleta específica
    //    (antes se usaba .in('referencia', ...) que liberaba transferencias de OTRAS boletas
    //     cuando compartían la misma referencia, ej: mismo número de cuenta del cliente)
    await supabase
      .from('transferencias')
      .update({ estado: 'LIBRE' })
      .eq('estado', `ASIGNADA a boleta ${numeroBoleta}`);

    // C. Eliminar definitivamente todos los abonos de esta boleta
    await supabase.from('abonos').delete().eq('numero_boleta', numeroBoleta);

    const liberarPayload = {
      telefono_cliente: null,
      estado: 'LIBRE',
      total_abonado: 0,
      saldo_restante: PRECIOS.RIFA_4_CIFRAS
    };

    const { error: errBoleta } = await supabase
      .from('boletas')
      .update(liberarPayload)
      .eq('numero', numeroBoleta);

    if (errBoleta) throw errBoleta;

    // GUARDAR EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({
        asesor: asesorReg,
        accion: 'Liberar Boleta',
        boleta: numeroBoleta,
        detalle: 'Se liberó la boleta, borrando historial y pagos'
    });

    return res.status(200).json({ status: 'ok', mensaje: `La boleta ${numeroBoleta} quedó totalmente LIBRE y sus pagos fueron borrados.` });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
