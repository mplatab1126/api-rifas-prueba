import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  try {
    // Si piden solo el conteo
    if (req.query.count === 'true') {
      const { count, error } = await supabase
        .from('boletas')
        .select('numero', { count: 'exact', head: true })
        .is('telefono_cliente', null);
      if (error) throw error;
      return res.status(200).json({ total: count || 0 });
    }

    let seleccionados = [];

    // Recorremos cada serie del 0 al 9, excluyendo los que se mostraron en la llamada anterior
    for (let i = 0; i <= 9; i++) {
      const { data: libresSerie, error } = await supabase
        .from('boletas')
        .select('numero')
        .is('telefono_cliente', null)
        .eq('mostrado', false)
        .like('numero', `${i}%`)
        .limit(50);

      if (error) throw error;

      if (libresSerie && libresSerie.length > 0) {
        libresSerie.sort(() => 0.5 - Math.random());
        const elegidos = libresSerie.slice(0, 5).map(b => b.numero);
        seleccionados.push(...elegidos);
      }
    }

    if (seleccionados.length === 0) {
      return res.status(200).json({ numeros_disponibles: "No hay boletas disponibles en este momento." });
    }

    // Limpiamos las marcas anteriores y marcamos los nuevos
    await supabase.from('boletas').update({ mostrado: false }).eq('mostrado', true);
    await supabase.from('boletas').update({ mostrado: true }).in('numero', seleccionados);

    seleccionados.sort((a, b) => parseInt(a) - parseInt(b));
    const textoFinal = seleccionados.join(' - ');

    res.status(200).json({
      numeros_disponibles: textoFinal
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
