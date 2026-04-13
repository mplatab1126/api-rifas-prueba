import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { estadoCuenta } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';

export default function EstadoCuentaScreen() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const res = await estadoCuenta();
      setData(res);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  useFocusEffect(useCallback(() => { cargar(); }, []));

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const r = data?.resumen;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={cargar} tintColor={colors.primary} />}
    >
      {/* Resumen principal */}
      <View style={styles.mainCard}>
        <View style={styles.circleBox}>
          <Text style={styles.circlePercent}>{r?.porcentaje_pagado || 0}%</Text>
          <Text style={styles.circleLabel}>pagado</Text>
        </View>

        <View style={styles.mainStats}>
          <StatRow icon="cart" label="Total comprado" value={formatMoney(r?.total_comprado)} />
          <StatRow icon="checkmark-circle" label="Abonado" value={formatMoney(r?.total_abonado)} color={colors.success} />
          <StatRow icon="alert-circle" label="Pendiente" value={formatMoney(r?.total_pendiente)} color={colors.warning} />
        </View>
      </View>

      {/* Resumen de boletas */}
      <View style={styles.boletasResumen}>
        <BoletaStat label="Total" value={r?.total_boletas || 0} icon="layers" />
        <BoletaStat label="Pagadas" value={r?.boletas_pagadas || 0} icon="checkmark" color={colors.success} />
        <BoletaStat label="Pendientes" value={r?.boletas_pendientes || 0} icon="time" color={colors.warning} />
      </View>

      {/* Desglose por tipo */}
      <Text style={styles.sectionTitle}>Por tipo de rifa</Text>
      {data?.por_tipo && (
        <>
          <TipoCard titulo="Principal" data={data.por_tipo.principal} />
          <TipoCard titulo="Diaria 2 cifras" data={data.por_tipo.diaria_2cifras} />
          <TipoCard titulo="Diaria 3 cifras" data={data.por_tipo.diaria_3cifras} />
        </>
      )}

      {/* Ultimos pagos */}
      {data?.ultimos_pagos?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Ultimos pagos</Text>
          {data.ultimos_pagos.map((pago, i) => (
            <View key={i} style={styles.pagoCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={styles.pagoInfo}>
                <Text style={styles.pagoMonto}>{formatMoney(pago.monto)}</Text>
                <Text style={styles.pagoMeta}>
                  Boleta {pago.numero_boleta} · {pago.metodo_pago}
                </Text>
              </View>
              <Text style={styles.pagoFecha}>{formatDate(pago.fecha)}</Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function StatRow({ icon, label, value, color }) {
  return (
    <View style={styles.statRow}>
      <Ionicons name={icon} size={18} color={color || colors.textSecondary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </View>
  );
}

function BoletaStat({ label, value, icon, color }) {
  return (
    <View style={styles.boletaStatItem}>
      <View style={[styles.boletaIconBox, color && { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={20} color={color || colors.primary} />
      </View>
      <Text style={styles.boletaStatValue}>{value}</Text>
      <Text style={styles.boletaStatLabel}>{label}</Text>
    </View>
  );
}

function TipoCard({ titulo, data }) {
  if (!data || data.cantidad === 0) return null;
  return (
    <View style={styles.tipoCard}>
      <Text style={styles.tipoTitle}>{titulo}</Text>
      <View style={styles.tipoRow}>
        <Text style={styles.tipoLabel}>{data.cantidad} boleta{data.cantidad > 1 ? 's' : ''}</Text>
        <View style={styles.tipoMontos}>
          <Text style={[styles.tipoMonto, { color: colors.success }]}>{formatMoney(data.abonado)}</Text>
          <Text style={styles.tipoSep}>/</Text>
          <Text style={[styles.tipoMonto, { color: colors.warning }]}>{formatMoney(data.pendiente)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  mainCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  circleBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  circlePercent: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary },
  circleLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  mainStats: { flex: 1 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  statLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  statValue: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  boletasResumen: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  boletaStatItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  boletaIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  boletaStatValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  boletaStatLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  tipoCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  tipoTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  tipoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tipoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  tipoMontos: { flexDirection: 'row', alignItems: 'center' },
  tipoMonto: { fontSize: fontSize.sm, fontWeight: '600' },
  tipoSep: { color: colors.textMuted, marginHorizontal: 4 },
  pagoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  pagoInfo: { flex: 1 },
  pagoMonto: { fontSize: fontSize.md, fontWeight: '700', color: colors.success },
  pagoMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  pagoFecha: { fontSize: fontSize.xs, color: colors.textMuted },
});
