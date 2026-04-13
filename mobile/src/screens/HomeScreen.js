import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { misBoletas } from '../lib/api';
import { formatMoney, statusColor } from '../lib/format';

export default function HomeScreen({ navigation, cliente }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);

    try {
      const res = await misBoletas();
      setData(res);
    } catch (err) {
      console.error('Error cargando boletas:', err);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [])
  );

  if (cargando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const nombre = data?.cliente?.nombre || cliente?.nombre || 'Cliente';

  return (
    <View style={styles.container}>
      {/* Header saludo */}
      <View style={styles.header}>
        <View>
          <Text style={styles.saludo}>Hola, {nombre.split(' ')[0]}</Text>
          <Text style={styles.subtitulo}>
            {data?.boletas?.length || 0} boleta{data?.boletas?.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.notifButton}
          onPress={() => navigation.navigate('Notificaciones')}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Resumen financiero rapido */}
      {data?.resumen && (
        <View style={styles.resumenCard}>
          <View style={styles.resumenItem}>
            <Text style={styles.resumenLabel}>Abonado</Text>
            <Text style={[styles.resumenValor, { color: colors.success }]}>
              {formatMoney(data.resumen.total_abonado)}
            </Text>
          </View>
          <View style={styles.resumenDivider} />
          <View style={styles.resumenItem}>
            <Text style={styles.resumenLabel}>Pendiente</Text>
            <Text style={[styles.resumenValor, { color: colors.warning }]}>
              {formatMoney(data.resumen.total_pendiente)}
            </Text>
          </View>
        </View>
      )}

      {/* Lista de boletas */}
      <FlatList
        data={data?.boletas || []}
        keyExtractor={(item, i) => `${item.tipo}-${item.numero}-${i}`}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => cargar(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="ticket-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>No tienes boletas aun</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('Explorar')}
            >
              <Text style={styles.emptyButtonText}>Ver numeros disponibles</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.boletaCard}
            onPress={() => navigation.navigate('BoletaDetalle', {
              numero: item.numero,
              tipo: item.tipo,
            })}
          >
            <View style={styles.boletaLeft}>
              <Text style={styles.boletaNumero}>{item.numero}</Text>
              <Text style={styles.boletaTipo}>{item.tipo_label || item.rifa}</Text>
            </View>

            <View style={styles.boletaRight}>
              <View style={[styles.estadoBadge, { backgroundColor: statusColor(item.estado) + '22' }]}>
                <Text style={[styles.estadoText, { color: statusColor(item.estado) }]}>
                  {item.estado}
                </Text>
              </View>
              <Text style={styles.boletaMonto}>
                {formatMoney(item.total_abonado)} / {formatMoney(item.precio_total)}
              </Text>

              {/* Barra de progreso */}
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, Math.round((Number(item.total_abonado || 0) / Math.max(Number(item.precio_total || 1), 1)) * 100))}%`,
                      backgroundColor: item.estado === 'Pagada' ? colors.success : colors.primary,
                    },
                  ]}
                />
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  saludo: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitulo: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumenCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  resumenItem: {
    flex: 1,
    alignItems: 'center',
  },
  resumenDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  resumenLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  resumenValor: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  boletaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  boletaLeft: {
    marginRight: spacing.md,
    alignItems: 'center',
    minWidth: 60,
  },
  boletaNumero: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  boletaTipo: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  boletaRight: {
    flex: 1,
  },
  estadoBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  estadoText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  boletaMonto: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
  },
  emptyButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
});
