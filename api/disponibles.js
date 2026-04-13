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

    // 3. Hacemos un recorrido exacto del 0 al 9
    for (let i = 0; i <= 9; i++) {
      // Le pedimos a Supabase específicamente boletas que empiecen con el número 'i'
      const { data: libresSerie, error } = await supabase
        .from('boletas')
        .select('numero')
        .is('telefono_cliente', null)
        .like('numero', `${i}%`) // Filtro mágico: busca que empiece por i (ej. 0%, 1%, etc)
        .limit(50); // Traemos hasta 50 opciones de esta serie para que haya variedad

      if (error) throw error;

      if (libresSerie && libresSerie.length > 0) {
        // Barajamos solo estas opciones de la serie actual
        libresSerie.sort(() => 0.5 - Math.random());
        // Agarramos las 5 primeras
        const elegidos = libresSerie.slice(0, 5).map(b => b.numero);
        // Las guardamos en nuestra bolsa principal
        seleccionados.push(...elegidos);
      }
    }

    if (seleccionados.length === 0) {
      return res.status(200).json({ numeros_disponibles: "No hay boletas disponibles en este momento." });
    }

    // 4. Ordenamos todos los 50 números recolectados matemáticamente de menor a mayor
    seleccionados.sort((a, b) => parseInt(a) - parseInt(b));

    // 5. Los unimos todos con un guión
    const textoFinal = seleccionados.join(' - ');

    // 6. Se lo enviamos a Chatea Pro
    res.status(200).json({
      numeros_disponibles: textoFinal
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
