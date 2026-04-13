import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { obtenerPerfil, actualizarPerfil, cerrarSesion } from '../lib/api';
import { borrarSesion } from '../lib/storage';

export default function PerfilScreen({ onLogout, navigation }) {
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      const res = await obtenerPerfil();
      setPerfil(res.perfil);
      setForm({
        nombre: res.perfil.nombre || '',
        apellido: res.perfil.apellido || '',
        ciudad: res.perfil.ciudad || '',
      });
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useFocusEffect(useCallback(() => { cargar(); }, []));

  const guardar = async () => {
    setGuardando(true);
    try {
      await actualizarPerfil(form);
      setEditando(false);
      cargar();
      Alert.alert('Listo', 'Datos actualizados');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesion',
      'Quieres salir de la app?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            try {
              await cerrarSesion();
            } catch (e) {}
            await borrarSesion();
            onLogout();
          },
        },
      ]
    );
  };

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(perfil?.nombre || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.nombreCompleto}>
          {perfil?.nombre} {perfil?.apellido}
        </Text>
        <Text style={styles.telefono}>{perfil?.telefono}</Text>
      </View>

      {/* Estadisticas */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{perfil?.boletas_principales || 0}</Text>
          <Text style={styles.statLabel}>Principales</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{perfil?.boletas_diarias || 0}</Text>
          <Text style={styles.statLabel}>Diarias</Text>
        </View>
      </View>

      {/* Datos editables */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis datos</Text>
          {!editando && (
            <TouchableOpacity onPress={() => setEditando(true)}>
              <Ionicons name="pencil" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {editando ? (
          <>
            <Campo label="Nombre" value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} />
            <Campo label="Apellido" value={form.apellido} onChange={v => setForm({ ...form, apellido: v })} />
            <Campo label="Ciudad" value={form.ciudad} onChange={v => setForm({ ...form, ciudad: v })} />

            <View style={styles.editButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditando(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.saveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <InfoRow icon="person" label="Nombre" value={perfil?.nombre || '-'} />
            <InfoRow icon="person-outline" label="Apellido" value={perfil?.apellido || '-'} />
            <InfoRow icon="location" label="Ciudad" value={perfil?.ciudad || '-'} />
            <InfoRow icon="call" label="Telefono" value={perfil?.telefono || '-'} />
          </>
        )}
      </View>

      {/* Menu opciones */}
      <View style={styles.section}>
        <MenuItem
          icon="receipt-outline"
          label="Estado de cuenta"
          onPress={() => navigation.navigate('EstadoCuenta')}
        />
        <MenuItem
          icon="trophy-outline"
          label="Resultados de sorteos"
          onPress={() => navigation.navigate('Resultados')}
        />
        <MenuItem
          icon="call-outline"
          label="Contacto y soporte"
          onPress={() => navigation.navigate('Contacto')}
        />
      </View>

      {/* Cerrar sesion */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Los Plata App v1.0.0</Text>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function Campo({ label, value, onChange }) {
  return (
    <View style={styles.campoBox}>
      <Text style={styles.campoLabel}>{label}</Text>
      <TextInput
        style={styles.campoInput}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.textMuted}
      />
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.hero, fontWeight: '700', color: colors.background },
  nombreCompleto: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  telefono: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.card,
    marginHorizontal: spacing.lg, borderRadius: borderRadius.md, padding: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: colors.border },
  statNum: { fontSize: fontSize.xl, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  section: {
    backgroundColor: colors.card, marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.md,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  infoLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  campoBox: { marginBottom: spacing.md },
  campoLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.xs },
  campoInput: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  editButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: borderRadius.sm, backgroundColor: colors.primary },
  saveText: { color: colors.background, fontWeight: '700' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm,
  },
  menuLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    paddingVertical: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.danger + '44', gap: spacing.sm,
  },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: fontSize.md },
  version: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.lg },
});
