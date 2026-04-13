import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { boletaDetalle } from '../lib/api';
import { formatMoney, formatDate, statusColor, tipoLabel } from '../lib/format';

export default function BoletaDetalleScreen({ route, navigation }) {
  const { numero, tipo } = route.params;
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await boletaDetalle(numero, tipo);
      setData(res);
    } catch (err) {
      Alert.alert('Error', err.message);
      navigation.goBack();
    } finally {
      setCargando(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const boleta = data?.boleta;
  if (!boleta) return null;

  const porcentaje = boleta.porcentaje_pagado || 0;

  return (
    <ScrollView style={styles.container}>
      {/* Numero grande */}
      <View style={styles.heroSection}>
        <Text style={styles.heroNumero}>{boleta.numero}</Text>
        <Text style={styles.heroTipo}>{tipoLabel(boleta.tipo)}</Text>
        <View style={[styles.estadoBadge, { backgroundColor: statusColor(boleta.estado) + '22' }]}>
          <Text style={[styles.estadoText, { color: statusColor(boleta.estado) }]}>
            {boleta.estado}
          </Text>
        </View>
      </View>

      {/* Progreso circular */}
      <View style={styles.progresoCard}>
        <View style={styles.progresoCircle}>
          <Text style={styles.progresoPercent}>{porcentaje}%</Text>
          <Text style={styles.progresoLabel}>pagado</Text>
        </View>
        <View style={styles.progresoInfo}>
          <View style={styles.progresoRow}>
            <Text style={styles.progresoKey}>Precio total</Text>
            <Text style={styles.progresoValue}>{formatMoney(boleta.precio_total)}</Text>
          </View>
          <View style={styles.progresoRow}>
            <Text style={styles.progresoKey}>Abonado</Text>
            <Text style={[styles.progresoValue, { color: colors.success }]}>
              {formatMoney(boleta.total_abonado)}
            </Text>
          </View>
          <View style={styles.progresoRow}>
            <Text style={styles.progresoKey}>Pendiente</Text>
            <Text style={[styles.progresoValue, { color: colors.warning }]}>
              {formatMoney(boleta.saldo_restante)}
            </Text>
          </View>
        </View>
      </View>

      {/* Barra de progreso */}
      <View style={styles.fullProgressBar}>
        <View
          style={[
            styles.fullProgressFill,
            {
              width: `${Math.min(100, porcentaje)}%`,
              backgroundColor: boleta.estado === 'Pagada' ? colors.success : colors.primary,
            },
          ]}
        />
      </View>

      {/* Info adicional */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.infoLabel}>Fecha de compra</Text>
          <Text style={styles.infoValue}>{formatDate(boleta.fecha_venta)}</Text>
        </View>
        {boleta.asesor && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.infoLabel}>Asesor</Text>
            <Text style={styles.infoValue}>{boleta.asesor}</Text>
          </View>
        )}
      </View>

      {/* Boton pagar */}
      {boleta.estado !== 'Pagada' && (
        <TouchableOpacity
          style={styles.pagarButton}
          onPress={() => navigation.navigate('EnviarComprobante', {
            numero: boleta.numero,
            tipo: boleta.tipo,
            saldo: boleta.saldo_restante,
          })}
        >
          <Ionicons name="card-outline" size={20} color={colors.background} />
          <Text style={styles.pagarText}>Enviar comprobante de pago</Text>
        </TouchableOpacity>
      )}

      {/* Historial de abonos */}
      <Text style={styles.sectionTitle}>
        Historial de pagos ({data?.total_abonos || 0})
      </Text>

      {(data?.abonos || []).length === 0 ? (
        <View style={styles.emptyAbonos}>
          <Text style={styles.emptyText}>No hay pagos registrados</Text>
        </View>
      ) : (
        data.abonos.map((abono, i) => (
          <View key={abono.id || i} style={styles.abonoCard}>
            <View style={styles.abonoLeft}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </View>
            <View style={styles.abonoCenter}>
              <Text style={styles.abonoMonto}>{formatMoney(abono.monto)}</Text>
              <Text style={styles.abonoFecha}>{formatDate(abono.fecha)}</Text>
              <Text style={styles.abonoMeta}>
                {abono.metodo_pago}{abono.asesor ? ` · ${abono.asesor}` : ''}
              </Text>
            </View>
            {abono.referencia && abono.referencia !== 'Sin Ref' && abono.referencia !== '0' && (
              <Text style={styles.abonoRef}>Ref: {abono.referencia}</Text>
            )}
          </View>
        ))
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  heroNumero: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.primary,
  },
  heroTipo: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  estadoBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  estadoText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  progresoCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  progresoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  progresoPercent: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  progresoLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  progresoInfo: {
    flex: 1,
  },
  progresoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progresoKey: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  progresoValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  fullProgressBar: {
    height: 6,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: 3,
    marginTop: spacing.sm,
  },
  fullProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  infoCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  infoValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  pagarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  pagarText: {
    color: colors.background,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  abonoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  abonoLeft: {
    marginRight: spacing.md,
  },
  abonoCenter: {
    flex: 1,
  },
  abonoMonto: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.success,
  },
  abonoFecha: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  abonoMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  abonoRef: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  emptyAbonos: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
