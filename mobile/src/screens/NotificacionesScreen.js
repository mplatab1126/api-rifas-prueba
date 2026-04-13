import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { notificaciones, marcarNotificacionesLeidas } from '../lib/api';
import { formatDateTime } from '../lib/format';

const ICONOS_TIPO = {
  pago_registrado: { name: 'checkmark-circle', color: '#4CAF50' },
  sorteo_resultado: { name: 'trophy', color: '#FFD700' },
  recordatorio_pago: { name: 'alarm', color: '#FF9800' },
  rifa_nueva: { name: 'star', color: '#2196F3' },
  boleta_pagada: { name: 'ribbon', color: '#4CAF50' },
  sistema: { name: 'information-circle', color: '#9E9E9E' },
};

export default function NotificacionesScreen() {
  const [data, setData] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const res = await notificaciones(50);
      setData(res.notificaciones || []);
      setNoLeidas(res.no_leidas || 0);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useFocusEffect(useCallback(() => { cargar(); }, []));

  const marcarTodas = async () => {
    try {
      await marcarNotificacionesLeidas();
      cargar();
    } catch (err) {
      console.error('Error marcando:', err);
    }
  };

  const icono = (tipo) => ICONOS_TIPO[tipo] || ICONOS_TIPO.sistema;

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {noLeidas > 0 && (
        <TouchableOpacity style={styles.marcarTodasBtn} onPress={marcarTodas}>
          <Ionicons name="checkmark-done" size={18} color={colors.primary} />
          <Text style={styles.marcarTodasText}>Marcar todas como leidas ({noLeidas})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={cargar} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="notifications-off-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tienes notificaciones</Text>
          </View>
        }
        renderItem={({ item }) => {
          const ic = icono(item.tipo);
          return (
            <View style={[styles.notifCard, !item.leida && styles.notifNoLeida]}>
              <View style={[styles.notifIcon, { backgroundColor: ic.color + '22' }]}>
                <Ionicons name={ic.name} size={22} color={ic.color} />
              </View>
              <View style={styles.notifContent}>
                <Text style={styles.notifTitulo}>{item.titulo}</Text>
                <Text style={styles.notifMensaje}>{item.mensaje}</Text>
                <Text style={styles.notifFecha}>{formatDateTime(item.fecha)}</Text>
              </View>
              {!item.leida && <View style={styles.notifDot} />}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  marcarTodasBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, gap: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  marcarTodasText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  notifNoLeida: {
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  notifContent: { flex: 1 },
  notifTitulo: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  notifMensaje: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },
  notifFecha: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  notifDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6,
  },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
});
