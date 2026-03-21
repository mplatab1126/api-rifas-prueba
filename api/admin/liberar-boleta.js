import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { numeroBoleta, contrasena } = req.body;
  // 2. Seguridad
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
  if (!numeroBoleta) return res.status(400).json({ status: 'error', mensaje: 'Falta el número de la boleta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // A. Buscar los abonos de esta boleta para ver si usaron transferencias del banco
    const { data: abonos, error: errAbonos } = await supabase
      .from('abonos')
      .select('referencia_transferencia')
      .eq('numero_boleta', numeroBoleta);

    if (errAbonos) throw errAbonos;

    // B. Liberar SOLO las transferencias asignadas a ESTA boleta específica
    //    (antes se usaba .in('referencia', ...) que liberaba transferencias de OTRAS boletas
    //     cuando compartían la misma referencia, ej: mismo número de cuenta del cliente)
    await supabase
      .from('transferencias')
      .update({ estado: 'LIBRE' })
      .eq('estado', `ASIGNADA a boleta ${numeroBoleta}`);

    // C. Eliminar definitivamente todos los abonos de esta boleta
    await supabase.from('abonos').delete().eq('numero_boleta', numeroBoleta);

    let tabla = 'boletas';
    let precioOriginal = 150000;
    let estadoOriginal = 'LIBRE';
    
    const longitud = String(numeroBoleta).trim().length;

    if (longitud === 2) {
      tabla = 'boletas_diarias';
      precioOriginal = 20000;
      estadoOriginal = 'Disponible';
    } else if (longitud === 3) {
      tabla = 'boletas_diarias_3cifras';
      precioOriginal = 5000;
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
