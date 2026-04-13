/**
 * Cliente API central para la app Los Plata.
 * Todas las pantallas usan estas funciones para hablar con el backend.
 */

const API_URL = 'https://www.losplata.com.co/api';

let _token = null;

export function setToken(token) {
  _token = token;
}

export function getToken() {
  return _token;
}

export function clearToken() {
  _token = null;
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

// ==================== AUTH ====================

export async function enviarOtp(telefono) {
  return request('/auth/enviar-otp', {
    method: 'POST',
    body: JSON.stringify({ telefono }),
  });
}

export async function verificarOtp(telefono, codigo) {
  return request('/auth/verificar-otp', {
    method: 'POST',
    body: JSON.stringify({ telefono, codigo, dispositivo: 'app-movil' }),
  });
}

export async function cerrarSesion() {
  return request('/app/cerrar-sesion', { method: 'POST' });
}

// ==================== BOLETAS ====================

export async function misBoletas() {
  return request('/app/mis-boletas');
}

export async function boletaDetalle(numero, tipo) {
  return request(`/app/boleta-detalle?numero=${numero}&tipo=${tipo}`);
}

export async function misAbonos(tipo = null, limite = 50) {
  let url = `/app/mis-abonos?limite=${limite}`;
  if (tipo) url += `&tipo=${tipo}`;
  return request(url);
}

// ==================== PERFIL ====================

export async function obtenerPerfil() {
  return request('/app/perfil');
}

export async function actualizarPerfil(datos) {
  return request('/app/perfil', {
    method: 'PUT',
    body: JSON.stringify(datos),
  });
}

// ==================== RIFA ====================

export async function rifaActiva() {
  return request('/app/rifa-activa');
}

export async function resultados(limite = 20) {
  return request(`/app/resultados?limite=${limite}`);
}

// ==================== NUMEROS ====================

export async function numerosDisponibles(tipo = '4cifras', cantidad = 20) {
  return request(`/app/numeros-disponibles?tipo=${tipo}&cantidad=${cantidad}`);
}

export async function buscarNumero(numero, tipo = '4cifras') {
  return request(`/app/numeros-disponibles?tipo=${tipo}&buscar=${numero}`);
}

export async function reservarNumero(numero, tipo) {
  return request('/app/reservar-numero', {
    method: 'POST',
    body: JSON.stringify({ numero, tipo }),
  });
}

// ==================== FINANCIERO ====================

export async function estadoCuenta() {
  return request('/app/estado-cuenta');
}

export async function enviarComprobante(datos) {
  return request('/app/comprobante', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
}

// ==================== NOTIFICACIONES ====================

export async function notificaciones(limite = 30, soloNoLeidas = false) {
  return request(`/app/notificaciones?limite=${limite}&no_leidas=${soloNoLeidas}`);
}

export async function marcarNotificacionesLeidas(ids = null) {
  const body = ids ? { ids } : { todas: true };
  return request('/app/notificaciones', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ==================== PUSH ====================

export async function registrarPushToken(pushToken) {
  return request('/app/push-token', {
    method: 'POST',
    body: JSON.stringify({ push_token: pushToken }),
  });
}

// ==================== CONTACTO ====================

export async function contacto() {
  return request('/app/contacto');
}
