/**
 * Precios centrales de las rifas Los Plata S.A.S.
 *
 * Este archivo es la UNICA fuente de verdad para los precios de las boletas.
 * Si necesitas cambiar el precio de una rifa, solo tienes que modificarlo aqui
 * y el cambio se aplica automaticamente en todo el sistema.
 *
 * - RIFA_4_CIFRAS: Rifa principal (camioneta + 2 motos). Numeros 0000-9999.
 * - RIFA_2_CIFRAS: Rifa diaria. Numeros 00-99.
 * - RIFA_3_CIFRAS: Rifa diaria. Numeros 000-999.
 */

export const PRECIOS = {
  RIFA_4_CIFRAS: 80000,
  RIFA_2_CIFRAS: 20000,
  RIFA_3_CIFRAS: 5000,
};

/**
 * Devuelve el precio de una boleta segun la longitud del numero.
 * Esto es util porque en varios endpoints se identifica el tipo de rifa
 * mirando cuantos digitos tiene el numero de boleta.
 *
 * @param {string|number} numero - Numero de boleta (ej: "0123", "45", "678")
 * @returns {number} precio en COP
 */
export function getPrecioPorLongitud(numero) {
  const limpio = String(numero).replace(/\D/g, '');
  if (limpio.length === 2) return PRECIOS.RIFA_2_CIFRAS;
  if (limpio.length === 3) return PRECIOS.RIFA_3_CIFRAS;
  return PRECIOS.RIFA_4_CIFRAS;
}
