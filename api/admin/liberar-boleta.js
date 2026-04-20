import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { PRECIOS } from '../config/precios.js';

const ASESORES_INDEPENDIENTES = ['alejandra plata', 'joaquín', 'joaquin', 'lili', 'liliana', 'luisa', 'luisa rivera', 'nena'];
const esIndependiente = (nombre) => nombre && ASESORES_INDEPENDIENTES.some(ind => nombre.toLowerCase().includes(ind));

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { numeroBoleta, contrasena } = req.body;
  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!numeroBoleta) return res.status(400).json({ status: 'error', mensaje: 'Falta el número de la boleta' });

  try {
    // A. Buscar los abonos de esta boleta para ver si usaron transferencias del banco
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('referencia_transferencia, monto')
      .eq('numero_boleta', numeroBoleta);

    if (errAbonos) throw errAbonos;

    // A2. AJUSTAR ESTADÍSTICAS DEL CLIENTE antes de borrar todo
    const longitud = String(numeroBoleta).trim().length;
    let tablaConsulta = 'boletas';
    let esDiaria = false;
    if (longitud === 2) { tablaConsulta = 'boletas_diarias'; esDiaria = true; }
    else if (longitud === 3) { tablaConsulta = 'boletas_diarias_3cifras'; esDiaria = true; }

    const { data: boletaActual } = await supabase
      .from(tablaConsulta)
      .select('telefono_cliente, saldo_restante, asesor')
      .eq('numero', numeroBoleta)
      .single();

    // Validar grupo de asesores: no puedes liberar boletas de otro grupo
    const asesorBoleta = boletaActual?.asesor || '';
    if (asesorBoleta) {
      const grupoAsesor = esIndependiente(nombreAsesor) ? 'independiente' : 'regular';
      const grupoBoleta = esIndependiente(asesorBoleta) ? 'independiente' : 'regular';
      if (grupoAsesor !== grupoBoleta) {
        return res.status(400).json({ status: 'error', mensaje: `🚫 Esta boleta pertenece al equipo "${grupoBoleta}". Tu equipo (${grupoAsesor}) no puede liberarla.` });
      }
    }

    if (boletaActual?.telefono_cliente) {
      const { data: clienteActual } = await supabase
        .from('clientes')
        .select('total_comprado, boletas_diarias_compradas, boletas_grandes_compradas')
        .eq('telefono', boletaActual.telefono_cliente)
        .single();

      if (clienteActual) {
        // Sumar montos de abonos que NO son premio rifa
        const montoARestar = (abonos || [])
          .filter(a => a.referencia_transferencia !== 'premio_rifa_diaria')
          .reduce((sum, a) => sum + Number(a.monto || 0), 0);

        let totalComprado = Math.max(0, (clienteActual.total_comprado || 0) - montoARestar);
        let diariasCompradas = clienteActual.boletas_diarias_compradas || 0;
        let grandesCompradas = clienteActual.boletas_grandes_compradas || 0;

        // Si la boleta estaba pagada, restar 1 al contador
        if (boletaActual.saldo_restante <= 0) {
          if (esDiaria) diariasCompradas = Math.max(0, diariasCompradas - 1);
          else grandesCompradas = Math.max(0, grandesCompradas - 1);
        }

        await supabase.from('clientes').update({
          total_comprado: totalComprado,
          boletas_diarias_compradas: diariasCompradas,
          boletas_grandes_compradas: grandesCompradas
        }).eq('telefono', boletaActual.telefono_cliente);
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

    let tabla = tablaConsulta;
    let precioOriginal = PRECIOS.RIFA_4_CIFRAS;
    let estadoOriginal = 'LIBRE';

    if (longitud === 2) {
      precioOriginal = PRECIOS.RIFA_2_CIFRAS;
      estadoOriginal = 'Disponible';
    } else if (longitud === 3) {
      precioOriginal = PRECIOS.RIFA_3_CIFRAS;
      estadoOriginal = 'Disponible';
    }

    const liberarPayload = {
      telefono_cliente: null,
      estado: estadoOriginal,
      total_abonado: 0,
      saldo_restante: precioOriginal
    };
    if (longitud === 2 || longitud === 3) liberarPayload.asesor = null;

    const { error: errBoleta } = await supabase
      .from(tabla)
      .update(liberarPayload)
      .eq('numero', numeroBoleta);

    if (errBoleta) throw errBoleta;

    // GUARDAR EN LA BITÁCORA
    await supabase.from('registro_movimientos').insert({
        asesor: nombreAsesor,
        accion: 'Liberar Boleta',
        boleta: numeroBoleta,
        detalle: 'Se liberó la boleta, borrando historial y pagos'
    });

    return res.status(200).json({ status: 'ok', mensaje: `La boleta ${numeroBoleta} quedó totalmente LIBRE y sus pagos fueron borrados.` });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
