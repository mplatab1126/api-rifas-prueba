import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { setToken, clearToken } from './src/lib/api';
import { obtenerToken, obtenerCliente, borrarSesion } from './src/lib/storage';
import { colors } from './src/lib/theme';
import LoginScreen from './src/screens/LoginScreen';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [cargando, setCargando] = useState(true);
  const [logueado, setLogueado] = useState(false);
  const [cliente, setCliente] = useState(null);

  useEffect(() => {
    verificarSesion();
  }, []);

  const verificarSesion = async () => {
    try {
      const token = await obtenerToken();
      const clienteGuardado = await obtenerCliente();
      if (token) {
        setToken(token);
        setCliente(clienteGuardado);
        setLogueado(true);
      }
    } catch (err) {
      console.error('Error verificando sesion:', err);
    } finally {
      setCargando(false);
    }
  };

  const handleLogin = (token, clienteData) => {
    setCliente(clienteData);
    setLogueado(true);
  };

  const handleLogout = async () => {
    clearToken();
    await borrarSesion();
    setCliente(null);
    setLogueado(false);
  };

  if (cargando) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!logueado) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
      }}
    >
      <StatusBar style="light" />
      <AppNavigator cliente={cliente} onLogout={handleLogout} />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
