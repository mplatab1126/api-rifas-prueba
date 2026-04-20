/**
 * Longitud del número nacional (sin indicativo) por país.
 * Tomado de perla-roja.html (DIGITOS_POR_PAIS).
 */
const LONGITUDES_NACIONALES = {
  '57': 10,   // Colombia
  '58': 11,   // Venezuela
  '593': 9,   // Ecuador
  '51': 9,    // Perú
  '1': 10,    // EE.UU.
  '52': 10,   // México
  '56': 9,    // Chile
  '54': 10,   // Argentina
  '507': 8,   // Panamá
  '34': 9,    // España
};

/**
 * Limpia y formatea un teléfono con indicativo de país (sin el +).
 * Corrige indicativos duplicados al inicio (bug del doble 57).
 *
 * Ej: limpiarTelefono('3101234567', '+57')    → '573101234567'  (normal)
 * Ej: limpiarTelefono('573101234567', '+57')  → '573101234567'  (ya tenía indicativo)
 * Ej: limpiarTelefono('575731012345', '+57')  → '573101234'    (doble 57: queda corto, llamador debe validar)
 */
export function limpiarTelefono(telefono, indicativo = '57') {
  const digitos = String(telefono).replace(/\D/g, '');
  const ind = String(indicativo).replace(/\D/g, '');
  const longNacional = LONGITUDES_NACIONALES[ind] || 10;

  let nacional = digitos;

  // 1) Quitar el indicativo del inicio mientras lo que quede sea más largo que el nacional
  //    (esto arregla números tipo 573101234567 -> 3101234567).
  while (nacional.startsWith(ind) && nacional.length > longNacional) {
    nacional = nacional.slice(ind.length);
  }

  // 2) Regla Colombia: los móviles reales SIEMPRE empiezan con 3, nunca con 57.
  //    Si después de lo anterior todavía empieza con 57, es porque el cliente
  //    escribió mal el número (le puso el código de país por error).
  //    Seguir quitando el 57 repetidas veces.
  if (ind === '57') {
    while (nacional.startsWith('57')) {
      nacional = nacional.slice(2);
    }
  }

  // 3) Si quedaron más dígitos de los esperados, tomar solo los últimos N
  if (nacional.length > longNacional) {
    nacional = nacional.slice(-longNacional);
  }

  return ind + nacional;
}

/**
 * Verifica si un teléfono (ya limpio) tiene un formato válido para su indicativo.
 * Útil para rechazar números corruptos antes de guardarlos o usarlos en WhatsApp.
 *
 * Ej: esTelefonoValido('573101234567')  → true
 * Ej: esTelefonoValido('5730286205')    → false (muy corto)
 * Ej: esTelefonoValido('575730286205')  → false (nacional empieza con 57, no con 3)
 */
export function esTelefonoValido(telefonoLimpio, indicativo = '57') {
  const digitos = String(telefonoLimpio).replace(/\D/g, '');
  const ind = String(indicativo).replace(/\D/g, '');
  const longNacional = LONGITUDES_NACIONALES[ind] || 10;
  const longTotal = ind.length + longNacional;

  if (digitos.length !== longTotal) return false;
  if (!digitos.startsWith(ind)) return false;

  const nacional = digitos.slice(ind.length);

  // Regla Colombia: móviles empiezan con 3
  if (ind === '57' && !nacional.startsWith('3')) return false;

  return true;
}
