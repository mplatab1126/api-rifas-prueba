/**
 * Helper de autenticacion de asesores.
 *
 * Los asesores se validan por contraseña simple. La variable de entorno
 * ASESORES_SECRETO contiene un JSON con { "contraseña": "Nombre del asesor" }.
 *
 * Uso normal:
 *
 *   import { validarAsesor } from '../lib/auth.js';
 *
 *   const nombreAsesor = validarAsesor(contrasena);
 *   if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
 *
 * Devuelve el nombre del asesor si la contraseña es correcta, o null si no.
 *
 * El if de respuesta queda del lado del caller porque algunos endpoints
 * usan mensajes distintos ("No autorizado", "Contraseña de asesor incorrecta",
 * "Acceso restringido", etc.) y tambien permisos adicionales (solo Mateo,
 * solo gerencia).
 *
 * @param {string} contrasena - Contraseña recibida del cliente
 * @returns {string|null} Nombre del asesor si es válido, null si no
 */
export function validarAsesor(contrasena) {
  if (!contrasena) return null;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  return asesores[contrasena] || null;
}
