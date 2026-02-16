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
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
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

    // B. Liberar las transferencias bancarias en la tabla 'transferencias'
    if (abonos && abonos.length > 0) {
      // Sacamos solo las referencias reales (ignoramos 'efectivo' o 'Sin Ref')
      const referencias = abonos
        .map(a => a.referencia_transferencia)
        .filter(ref => ref && ref !== 'Sin Ref' && ref !== 'efectivo' && ref !== '0');
        
      if (referencias.length > 0) {
        await supabase
          .from('transferencias')
          .update({ estado: 'LIBRE' })
          .in('referencia', referencias);
      }
    }

    // C. Eliminar definitivamente todos los abonos de esta boleta
    await supabase.from('abonos').delete().eq('numero_boleta', numeroBoleta);

    // D. Reiniciar la boleta (Dejarla lista para vender de nuevo)
    const { error: errBoleta } = await supabase
      .from('boletas')
      .update({
        telefono_cliente: null,
        estado: 'LIBRE',
        total_abonado: 0,
        saldo_restante: 150000 // Volvemos al precio original
      })
      .eq('numero', numeroBoleta);

    if (errBoleta) throw errBoleta;

    return res.status(200).json({ status: 'ok', mensaje: `La boleta ${numeroBoleta} quedó totalmente LIBRE y sus pagos fueron borrados.` });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
