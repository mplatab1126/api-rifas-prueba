/**
 * Almacenamiento seguro para el token de sesion.
 * Usa expo-secure-store que encripta los datos en el dispositivo.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'los_plata_token';
const CLIENT_KEY = 'los_plata_cliente';

export async function guardarSesion(token, cliente) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(CLIENT_KEY, JSON.stringify(cliente));
}

export async function obtenerToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function obtenerCliente() {
  const data = await SecureStore.getItemAsync(CLIENT_KEY);
  return data ? JSON.parse(data) : null;
}

export async function borrarSesion() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(CLIENT_KEY);
}
