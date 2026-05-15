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

    // Canal del que viene la llamada: 'web' (página) o 'chatea' (Camila en WhatsApp).
    // Cada canal tiene su propio "cajón" de mostrados, así no se pisan entre sí.
    // Default: 'web' por compatibilidad con llamadas viejas que no manden el parámetro.
    const canalRaw = String(req.query.canal || 'web').toLowerCase().trim();
    const canal = (canalRaw === 'chatea' || canalRaw === 'web') ? canalRaw : 'web';

    const TOTAL_DESEADO = 50;
    const POR_SERIE = 5;
    let seleccionados = [];

    // Lista de números que el cliente ya tiene en pantalla y NO queremos repetir.
    // Llega como ?exclude=0123,0456,0789 desde el frontend.
    const excludeRaw = req.query.exclude || '';
    const excluidos = new Set(
      excludeRaw
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d{1,4}$/.test(s))
        .map(s => s.padStart(4, '0'))
    );

    // 1) Intento de "variedad": tomar hasta 5 de cada serie 0-9.
    //    Filtro: boletas libres (telefono_cliente null) que NO estén marcadas
    //    en NINGÚN canal. Así la web no muestra los que Camila está mostrando,
    //    ni Camila muestra los de la web. Cada canal libera sus propias marcas
    //    al final de la función, así un canal saturado no bloquea al otro.
    const LIMITE_POR_SERIE = excluidos.size > 0 ? 200 : 50;
    for (let i = 0; i <= 9; i++) {
      const { data: libresSerie, error } = await supabase
        .from('boletas')
        .select('numero')
        .is('telefono_cliente', null)
        .is('mostrado_canal', null)
        .like('numero', `${i}%`)
        .limit(LIMITE_POR_SERIE);

      if (error) throw error;

      if (libresSerie && libresSerie.length > 0) {
        const candidatosSerie = libresSerie.filter(b => !excluidos.has(b.numero));
        candidatosSerie.sort(() => 0.5 - Math.random());
        const elegidos = candidatosSerie.slice(0, POR_SERIE).map(b => b.numero);
        seleccionados.push(...elegidos);
      }
    }

    // 2) Si después del paso 1 no llegamos a 50 (porque hay series agotadas o
    //    excluidos comieron mucho), completamos con cualquier disponible.
    if (seleccionados.length < TOTAL_DESEADO) {
      const faltan = TOTAL_DESEADO - seleccionados.length;
      const yaSelectos = new Set(seleccionados);

      const { data: pool, error: errPool } = await supabase
        .from('boletas')
        .select('numero')
        .is('telefono_cliente', null)
        .is('mostrado_canal', null)
        .limit(2000);

      if (errPool) throw errPool;

      if (pool && pool.length > 0) {
        const candidatosExtra = pool.filter(
          b => !yaSelectos.has(b.numero) && !excluidos.has(b.numero)
        );
        candidatosExtra.sort(() => 0.5 - Math.random());
        const adicionales = candidatosExtra.slice(0, faltan).map(b => b.numero);
        seleccionados.push(...adicionales);
      }
    }

    if (seleccionados.length === 0) {
      return res.status(200).json({ numeros_disponibles: "No hay boletas disponibles en este momento." });
    }

    // Limpiamos las marcas anteriores DE ESTE CANAL únicamente (no tocamos las del otro)
    // y marcamos los nuevos con el canal correspondiente.
    await supabase.from('boletas').update({ mostrado_canal: null }).eq('mostrado_canal', canal);
    await supabase.from('boletas').update({ mostrado_canal: canal }).in('numero', seleccionados);

    seleccionados.sort((a, b) => parseInt(a) - parseInt(b));
    const textoFinal = seleccionados.join(' - ');

    res.status(200).json({
      numeros_disponibles: textoFinal
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
