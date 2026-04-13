import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { enviarOtp, verificarOtp, setToken } from '../lib/api';
import { guardarSesion } from '../lib/storage';

export default function LoginScreen({ onLogin }) {
  const [paso, setPaso] = useState('telefono'); // 'telefono' o 'codigo'
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const codigoRef = useRef(null);

  const enviarCodigo = async () => {
    const tel = telefono.replace(/\D/g, '');
    if (tel.length < 10) {
      Alert.alert('Error', 'Ingresa un numero de celular valido (10 digitos)');
      return;
    }

    setCargando(true);
    try {
      await enviarOtp(tel);
      setPaso('codigo');
      setTimeout(() => codigoRef.current?.focus(), 300);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setCargando(false);
    }
  };

  const verificar = async () => {
    if (codigo.length !== 6) {
      Alert.alert('Error', 'El codigo debe tener 6 digitos');
      return;
    }

    setCargando(true);
    try {
      const tel = telefono.replace(/\D/g, '');
      const data = await verificarOtp(tel, codigo);
      setToken(data.token);
      await guardarSesion(data.token, data.cliente);
      onLogin(data.token, data.cliente);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

      <View style={styles.logoSection}>
        <View style={styles.logoCircle}>
          <Ionicons name="trophy" size={48} color={colors.primary} />
        </View>
        <Text style={styles.appName}>Los Plata</Text>
        <Text style={styles.subtitle}>Tu app de rifas</Text>
      </View>

      {paso === 'telefono' ? (
        <View style={styles.formSection}>
          <Text style={styles.label}>Ingresa tu numero de celular</Text>
          <Text style={styles.hint}>
            Te enviaremos un codigo por WhatsApp para verificar tu identidad
          </Text>

          <View style={styles.inputRow}>
            <View style={styles.prefixBox}>
              <Text style={styles.prefixText}>+57</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="3101234567"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={10}
              value={telefono}
              onChangeText={setTelefono}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.button, cargando && styles.buttonDisabled]}
            onPress={enviarCodigo}
            disabled={cargando}
          >
            {cargando ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Enviar codigo</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.formSection}>
          <Text style={styles.label}>Ingresa el codigo</Text>
          <Text style={styles.hint}>
            Enviamos un codigo de 6 digitos al {telefono}
          </Text>

          <TextInput
            ref={codigoRef}
            style={[styles.input, styles.codigoInput]}
            placeholder="000000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            value={codigo}
            onChangeText={setCodigo}
            textAlign="center"
          />

          <TouchableOpacity
            style={[styles.button, cargando && styles.buttonDisabled]}
            onPress={verificar}
            disabled={cargando}
          >
            {cargando ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Verificar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => { setPaso('telefono'); setCodigo(''); }}
          >
            <Text style={styles.linkText}>Cambiar numero</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={enviarCodigo}
            disabled={cargando}
          >
            <Text style={styles.linkText}>Reenviar codigo</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  appName: {
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  formSection: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  label: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  prefixBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prefixText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.lg,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codigoInput: {
    fontSize: fontSize.xxl,
    letterSpacing: 12,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.background,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    fontSize: fontSize.md,
  },
});
