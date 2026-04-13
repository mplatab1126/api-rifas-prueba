import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { resultados } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';

export default function ResultadosScreen() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const res = await resultados(30);
      setData(res);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={cargar} tintColor={colors.primary} />}
    >
      {/* Ganadores de rifa principal */}
      {data?.ganadores_principal?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Ganadores</Text>
          {data.ganadores_principal.map((g, i) => (
            <View key={i} style={styles.ganadorCard}>
              <View style={styles.ganadorIcon}>
                <Ionicons name="trophy" size={24} color="#FFD700" />
              </View>
              <View style={styles.ganadorInfo}>
                <Text style={styles.ganadorNombre}>{g.nombre}</Text>
                <Text style={styles.ganadorMeta}>
                  {g.ciudad ? `${g.ciudad} · ` : ''}Boleta #{g.numero_boleta}
                </Text>
              </View>
              <Text style={styles.ganadorFecha}>{formatDate(g.fecha)}</Text>
            </View>
          ))}
        </>
      )}

      {/* Historial diarias */}
      {data?.historial_diarias?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Historial de rifas diarias</Text>
          {data.historial_diarias.map((h, i) => (
            <View key={i} style={styles.historialCard}>
              <View style={styles.historialHeader}>
                <Text style={styles.historialTipo}>{h.tipo_label}</Text>
                <Text style={styles.historialFecha}>{formatDate(h.fecha)}</Text>
              </View>
              {h.loteria ? (
                <Text style={styles.historialLoteria}>Loteria: {h.loteria}</Text>
              ) : null}
              <View style={styles.historialStats}>
                <View style={styles.historialStat}>
                  <Text style={styles.historialStatVal}>{h.vendidas}/{h.total_boletas}</Text>
                  <Text style={styles.historialStatLbl}>Vendidas</Text>
                </View>
                <View style={styles.historialStat}>
                  <Text style={[styles.historialStatVal, { color: colors.success }]}>
                    {formatMoney(h.recaudo_total)}
                  </Text>
                  <Text style={styles.historialStatLbl}>Recaudo</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {(!data?.ganadores_principal?.length && !data?.historial_diarias?.length) && (
        <View style={styles.emptyBox}>
          <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aun no hay resultados</Text>
        </View>
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '600', color: colors.text,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  ganadorCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  ganadorIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFD700' + '22', justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  ganadorInfo: { flex: 1 },
  ganadorNombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  ganadorMeta: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  ganadorFecha: { fontSize: fontSize.xs, color: colors.textMuted },
  historialCard: {
    backgroundColor: colors.card, marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  historialHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  historialTipo: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  historialFecha: { fontSize: fontSize.xs, color: colors.textMuted },
  historialLoteria: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  historialStats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  historialStat: {},
  historialStatVal: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  historialStatLbl: { fontSize: fontSize.xs, color: colors.textSecondary },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.md },
});
