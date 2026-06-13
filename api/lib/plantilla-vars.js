/**
 * Variables de plantilla (los {{1}}, {{2}}… de las plantillas de WhatsApp).
 *
 * Pieza compartida por los TRES lugares que mandan plantillas:
 *   - api/whatsapp/difusiones.js     (envío manual / prueba de una campaña)
 *   - api/lib/difusion-envio.js      (envío por lotes de una campaña)
 *   - api/whatsapp/plantillas.js     (enviar una plantilla a UN chat)
 *
 * Así la lista de datos que se pueden poner en una variable vive en un solo
 * sitio y no se desincroniza entre archivos.
 *
 * Datos (tokens) que el asesor puede elegir para una variable:
 *   {nombre}    → nombre del cliente
 *   {apellido}  → apellido del cliente
 *   {telefono}  → su número de teléfono
 *   {ciudad}    → su ciudad
 *   {abonado}   → total abonado (suma de TODAS sus boletas), formateado: $80.000
 *   {restante}  → total que debe (suma de TODAS sus boletas), formateado: $20.000
 *   {boleta}    → número(s) de boleta; si tiene varias, las lista: "0123, 4567"
 * Cualquier otro texto se deja igual (texto fijo para todos).
 */

import { supabaseAdmin } from './supabase.js';

// 80000 → "$80.000". Sin decimales, con puntos de miles (sin depender de locale).
function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const soloDigitos10 = t => String(t || '').replace(/\D/g, '').slice(-10);

// Reemplaza cada token por el dato real del destinatario. `dest` puede traer ya
// los campos enriquecidos (ver enriquecerDestinatarios); si no, los ausentes
// quedan vacíos.
export function resolverParametros(variables, dest = {}) {
  if (!Array.isArray(variables)) return [];
  return variables.map(v => {
    const s = String(v == null ? '' : v);
    switch (s) {
      case '{nombre}':   return (dest.nombre || '').trim();
      case '{apellido}': return (dest.apellido || '').trim();
      case '{telefono}': return dest.telefono || '';
      case '{ciudad}':   return (dest.ciudad || '').trim();
      case '{abonado}':  return pesos(dest.abonado);
      case '{restante}': return pesos(dest.restante);
      case '{boleta}':   return (dest.boletas || '').trim();
      default:           return s;
    }
  });
}

// Cuerpo con las variables ya puestas, para guardarlo en el historial del chat.
export function textoFinal(cuerpo, params) {
  let t = String(cuerpo || '');
  (params || []).forEach((val, i) => { t = t.replaceAll(`{{${i + 1}}}`, String(val ?? '')); });
  return t;
}

/**
 * Le agrega a cada destinatario sus datos de cliente y de boletas (apellido,
 * ciudad, total abonado, total restante, números de boleta), consultados EN EL
 * MOMENTO del envío (así el saldo siempre está al día). Es solo lectura.
 *
 * lote: [{ telefono, nombre?, ... }]  →  [{ ...igual, apellido, ciudad, abonado, restante, boletas }]
 */
export async function enriquecerDestinatarios(lote) {
  if (!Array.isArray(lote) || !lote.length) return lote || [];
  const tels = [...new Set(lote.map(d => d && d.telefono).filter(Boolean))];
  const mapa = new Map();
  if (tels.length) {
    const { data } = await supabaseAdmin.rpc('difusion_datos_cliente', { p_telefonos: tels });
    for (const r of (data || [])) mapa.set(r.tel10, r);
  }
  return lote.map(d => {
    const x = mapa.get(soloDigitos10(d.telefono)) || {};
    return {
      ...d,
      apellido: x.apellido || '',
      ciudad: x.ciudad || '',
      abonado: x.abonado || 0,
      restante: x.restante || 0,
      boletas: x.boletas || '',
    };
  });
}
