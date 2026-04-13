import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';

import HomeScreen from '../screens/HomeScreen';
import ExplorarScreen from '../screens/ExplorarScreen';
import RifaScreen from '../screens/RifaScreen';
import PerfilScreen from '../screens/PerfilScreen';
import BoletaDetalleScreen from '../screens/BoletaDetalleScreen';
import NotificacionesScreen from '../screens/NotificacionesScreen';
import EstadoCuentaScreen from '../screens/EstadoCuentaScreen';
import ResultadosScreen from '../screens/ResultadosScreen';
import ContactoScreen from '../screens/ContactoScreen';
import EnviarComprobanteScreen from '../screens/EnviarComprobanteScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '600' },
};

function HomeStack({ cliente }) {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MisBoletas" options={{ headerShown: false }}>
        {(props) => <HomeScreen {...props} cliente={cliente} />}
      </Stack.Screen>
      <Stack.Screen
        name="BoletaDetalle"
        component={BoletaDetalleScreen}
        options={{ title: 'Detalle de boleta' }}
      />
      <Stack.Screen
        name="EnviarComprobante"
        component={EnviarComprobanteScreen}
        options={{ title: 'Enviar comprobante' }}
      />
      <Stack.Screen
        name="Notificaciones"
        component={NotificacionesScreen}
        options={{ title: 'Notificaciones' }}
      />
    </Stack.Navigator>
  );
}

function ExplorarStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="NumerosDisponibles"
        component={ExplorarScreen}
        options={{ title: 'Numeros disponibles' }}
      />
    </Stack.Navigator>
  );
}

function RifaStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="RifaActiva"
        component={RifaScreen}
        options={{ title: 'La Rifa' }}
      />
    </Stack.Navigator>
  );
}

function PerfilStack({ onLogout }) {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MiPerfil" options={{ title: 'Mi Perfil' }}>
        {(props) => <PerfilScreen {...props} onLogout={onLogout} />}
      </Stack.Screen>
      <Stack.Screen
        name="EstadoCuenta"
        component={EstadoCuentaScreen}
        options={{ title: 'Estado de cuenta' }}
      />
      <Stack.Screen
        name="Resultados"
        component={ResultadosScreen}
        options={{ title: 'Resultados' }}
      />
      <Stack.Screen
        name="Contacto"
        component={ContactoScreen}
        options={{ title: 'Contacto' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator({ cliente, onLogout }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          switch (route.name) {
            case 'Inicio': iconName = focused ? 'home' : 'home-outline'; break;
            case 'Explorar': iconName = focused ? 'search' : 'search-outline'; break;
            case 'Rifa': iconName = focused ? 'trophy' : 'trophy-outline'; break;
            case 'Perfil': iconName = focused ? 'person' : 'person-outline'; break;
            default: iconName = 'ellipse';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Inicio">
        {() => <HomeStack cliente={cliente} />}
      </Tab.Screen>
      <Tab.Screen name="Explorar" component={ExplorarStack} />
      <Tab.Screen name="Rifa" component={RifaStack} />
      <Tab.Screen name="Perfil">
        {() => <PerfilStack onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
