import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';
import { numerosDisponibles } from './lib/numeros-disponibles.js';

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

    // Lista COMPLETA para el panel de asesores (admin.html → vista "Disponibles").
    // Solo lectura: NO marca mostrado_canal, así no interfiere con lo que el bot muestra.
    if (req.query.lista === 'todas') {
      const numeros = [];
      const PAGINA = 1000;
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase
          .from('boletas')
          .select('numero')
          .is('telefono_cliente', null)
          .order('numero', { ascending: true })
          .range(desde, desde + PAGINA - 1);
        if (error) throw error;
        numeros.push(...(data || []).map(b => b.numero));
        if (!data || data.length < PAGINA) break;
      }
      return res.status(200).json({ total: numeros.length, numeros });
    }

    // Selección + marca de canal (web / chatea / bandeja) -> misma función reutilizable.
    const { texto } = await numerosDisponibles({ canal: req.query.canal, exclude: req.query.exclude });
    return res.status(200).json({ numeros_disponibles: texto });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
