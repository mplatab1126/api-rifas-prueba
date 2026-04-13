/**
 * Limpia y formatea un teléfono con indicativo de país (sin el +).
 * Ej: limpiarTelefono('3101234567', '+57') → '573101234567'
 * Ej: limpiarTelefono('573101234567')      → '573101234567' (ya tiene indicativo)
 */
export function limpiarTelefono(telefono, indicativo = '57') {
  const digitos = String(telefono).replace(/\D/g, '');
  const ind = String(indicativo).replace(/\D/g, '');
  if (digitos.startsWith(ind) && digitos.length > 10) return digitos;
  return ind + digitos.slice(-10);
}
