import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { numero } = req.query;
  if (!numero) return res.status(400).json({ status: 'error', mensaje: 'Falta la boleta' });

  try {
    // Buscamos los abonos de esta boleta, ordenados por los más recientes primero
    const { data, error } = await supabase
      .from('abonos')
      .select('*')
      .eq('numero_boleta', numero)
      .order('fecha_pago', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return res.status(200).json({ status: 'ok', lista: [] });

    // Para cada abono, buscamos la URL del comprobante en la tabla transferencias
    const sinRef = ['Sin Ref', 'efectivo', 'sin ref', ''];
    const referencias = [...new Set(data.map(a => a.referencia_transferencia).filter(r => r && !sinRef.includes(r.toLowerCase())))];

    let mapaUrlPorRef = {};
    let mapaUrlPorFechaMonto = {};

    if (referencias.length > 0) {
      const { data: trans } = await supabase
        .from('transferencias')
        .select('referencia, fecha_pago, monto, hora_pago, url_comprobante')
        .in('referencia', referencias);

      if (trans) {
        trans.forEach(t => {
          if (t.url_comprobante) {
            const key = `${t.referencia}|${t.fecha_pago}`;
            mapaUrlPorRef[key] = t.url_comprobante;
          }
        });
      }
    }

    // Para abonos con referencia "0" (corresponsal), buscamos por fecha + monto + hora
    const abonosSinRef = data.filter(a => !a.referencia_transferencia || sinRef.includes(a.referencia_transferencia.toLowerCase()) || a.referencia_transferencia === '0');
    if (abonosSinRef.length > 0) {
      const fechasUnicas = [...new Set(abonosSinRef.map(a => a.fecha_pago.substring(0, 10)))];
      const montosUnicos = [...new Set(abonosSinRef.map(a => a.monto))];

      const { data: transCero } = await supabase
        .from('transferencias')
        .select('referencia, fecha_pago, monto, hora_pago, url_comprobante')
        .in('fecha_pago', fechasUnicas)
        .in('monto', montosUnicos)
        .eq('referencia', '0');

      if (transCero) {
        transCero.forEach(t => {
          if (t.url_comprobante) {
            const key = `0|${t.fecha_pago}|${t.monto}|${t.hora_pago ? t.hora_pago.substring(0, 5) : ''}`;
            mapaUrlPorFechaMonto[key] = t.url_comprobante;
          }
        });
      }
    }

    // Adjuntamos la URL a cada abono
    const listaEnriquecida = data.map(a => {
      const ref = a.referencia_transferencia || '';
      const fechaAbono = a.fecha_pago.substring(0, 10);
      let url = null;

      if (ref && ref !== '0' && !sinRef.includes(ref.toLowerCase())) {
        url = mapaUrlPorRef[`${ref}|${fechaAbono}`] || null;
      } else {
        // Para corresponsal buscamos la primera coincidencia por fecha+monto
        const prefijo = `0|${fechaAbono}|${a.monto}|`;
        const llaveCoincidente = Object.keys(mapaUrlPorFechaMonto).find(k => k.startsWith(prefijo));
        if (llaveCoincidente) url = mapaUrlPorFechaMonto[llaveCoincidente];
      }

      return { ...a, url_comprobante: url };
    });

    return res.status(200).json({ status: 'ok', lista: listaEnriquecida });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
