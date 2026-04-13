/**
 * Endpoint público: trae 50 boletas aleatorias disponibles de la rifa
 * principal (4 cifras) + estadísticas para la página rifa.html.
 *
 * Estrategia para no sobrecargar al navegador con 10.000 botones:
 * tomamos 5 boletas libres de cada decena (0xxx, 1xxx, ..., 9xxx),
 * las mezclamos y las devolvemos. Así el cliente siempre ve 50 opciones
 * variadas. Si quiere otro número específico, usa el buscador.
 *
 * También calculamos cuántas boletas hay disponibles en total para
 * alimentar la barra de progreso y el banner de "solo X disponibles".
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS')) return;

  try {
    // 1. Sacamos 50 números aleatorios disponibles (5 por cada decena)
    const seleccionados = [];
    for (let i = 0; i <= 9; i++) {
      const { data: libresSerie, error } = await supabase
        .from('boletas')
        .select('numero')
        .is('telefono_cliente', null)
        .like('numero', `${i}%`)
        .limit(50);

      if (error) throw error;

      if (libresSerie && libresSerie.length > 0) {
        libresSerie.sort(() => 0.5 - Math.random());
        const elegidos = libresSerie.slice(0, 5).map(b => ({ numero: b.numero }));
        seleccionados.push(...elegidos);
      }
    }

    // Ordenamos de menor a mayor para que se vean bonitos en la rejilla
    seleccionados.sort((a, b) => parseInt(a.numero) - parseInt(b.numero));

    // 2. Contamos cuántas boletas disponibles hay EN TOTAL (barra de progreso)
    const { count: totalDisponibles } = await supabase
      .from('boletas')
      .select('numero', { count: 'exact', head: true })
      .is('telefono_cliente', null);

    // 3. Contamos el total de boletas de la rifa
    const { count: totalBoletas } = await supabase
      .from('boletas')
      .select('numero', { count: 'exact', head: true });

    return res.status(200).json({
      status: 'ok',
      muestra: seleccionados,
      stats: {
        total: totalBoletas || 0,
        disponibles: totalDisponibles || 0,
        vendidas: (totalBoletas || 0) - (totalDisponibles || 0),
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
