import { supabase } from './supabase.js';

// ──────────────────────────────────────────────────────────────────────────
// Selección de ~50 boletas disponibles, con variedad por serie (0-9) y una
// marca de "canal" para que los distintos canales (web, ChateaPro, bandeja)
// no muestren los mismos números a la vez. La marca es SUAVE: cada canal
// libera sus propias marcas en cada llamada y NO reserva de verdad (si un
// número está libre, se puede vender aunque otro canal lo esté mostrando).
//
// La usan: api/disponibles.js (web/ChateaPro) y la bandeja de WhatsApp
// (respuesta rápida "Números disponibles"). Es la MISMA función para todos.
//
// canales válidos: 'web' | 'chatea' | 'bandeja'. Cualquier otro cae a 'web'.
// Devuelve: { texto: "0001 - 0123 - ...", numeros: ['0001', ...] }
// ──────────────────────────────────────────────────────────────────────────

const CANALES_VALIDOS = ['web', 'chatea', 'bandeja'];

export async function numerosDisponibles({ canal = 'web', exclude = '' } = {}) {
  const canalRaw = String(canal || 'web').toLowerCase().trim();
  const canalFinal = CANALES_VALIDOS.includes(canalRaw) ? canalRaw : 'web';

  const TOTAL_DESEADO = 50;
  const POR_SERIE = 5;
  let seleccionados = [];

  // Números que el cliente ya tiene en pantalla y no queremos repetir.
  const excluidos = new Set(
    String(exclude || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => /^\d{1,4}$/.test(s))
      .map(s => s.padStart(4, '0'))
  );

  // 1) Variedad: hasta 5 de cada serie 0-9, entre las libres y no mostradas en ningún canal.
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
      seleccionados.push(...candidatosSerie.slice(0, POR_SERIE).map(b => b.numero));
    }
  }

  // 2) Completar hasta 50 con cualquier disponible si alguna serie estaba agotada.
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
      const candidatosExtra = pool.filter(b => !yaSelectos.has(b.numero) && !excluidos.has(b.numero));
      candidatosExtra.sort(() => 0.5 - Math.random());
      seleccionados.push(...candidatosExtra.slice(0, faltan).map(b => b.numero));
    }
  }

  if (seleccionados.length === 0) {
    return { texto: 'No hay boletas disponibles en este momento.', numeros: [] };
  }

  // Liberar las marcas anteriores DE ESTE CANAL y marcar las nuevas.
  await supabase.from('boletas').update({ mostrado_canal: null }).eq('mostrado_canal', canalFinal);
  await supabase.from('boletas').update({ mostrado_canal: canalFinal }).in('numero', seleccionados);

  seleccionados.sort((a, b) => parseInt(a) - parseInt(b));
  return { texto: seleccionados.join(' - '), numeros: seleccionados };
}
