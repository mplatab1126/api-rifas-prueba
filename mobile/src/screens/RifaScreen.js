import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { rifaActiva } from '../lib/api';
import { formatMoney } from '../lib/format';

export default function RifaScreen() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const res = await rifaActiva();
      setData(res);
    } catch (err) {
      console.error('Error cargando rifa:', err);
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

  const principal = data?.principal;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={cargar} tintColor={colors.primary} />}
    >
      {/* Rifa Principal */}
      {principal && (
        <>
          <View style={styles.heroCard}>
            <Ionicons name="trophy" size={40} color={colors.primary} />
            <Text style={styles.heroTitle}>{principal.nombre}</Text>
            {principal.numero_rifa && (
              <Text style={styles.heroRifaNum}>Rifa #{principal.numero_rifa}</Text>
            )}
          </View>

          {/* Premios */}
          {principal.premios && principal.premios.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Premios</Text>
              {principal.premios.map((premio, i) => (
                <View key={i} style={styles.premioCard}>
                  <View style={styles.premioIconBox}>
                    <Ionicons
                      name={i === 0 ? 'trophy' : i === 1 ? 'medal' : 'star'}
                      size={24}
                      color={i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'}
                    />
                  </View>
                  <View style={styles.premioInfo}>
                    <Text style={styles.premioNombre}>{premio.nombre}</Text>
                    {premio.descripcion ? (
                      <Text style={styles.premioDesc}>{premio.descripcion}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.premioValor}>{formatMoney(premio.valor)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Progreso de ventas */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Progreso de ventas</Text>
            <ProgresoCard
              label="Rifa Principal"
              progreso={principal.progreso}
              icon="ticket"
            />
          </View>
        </>
      )}

      {/* Rifas diarias */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rifas Diarias</Text>

        {data?.diaria_2cifras && (
          <DiariaCard data={data.diaria_2cifras} titulo="Diaria 2 cifras" />
        )}
        {data?.diaria_3cifras && (
          <DiariaCard data={data.diaria_3cifras} titulo="Diaria 3 cifras" />
        )}
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function ProgresoCard({ label, progreso, icon }) {
  if (!progreso) return null;
  const pct = progreso.porcentaje || 0;

  return (
    <View style={styles.progresoCard}>
      <View style={styles.progresoHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={styles.progresoLabel}>{label}</Text>
        <Text style={styles.progresoPct}>{pct}%</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.progresoStats}>
        <Stat label="Vendidas" value={progreso.vendidas} />
        <Stat label="Pagadas" value={progreso.pagadas} />
        <Stat label="Total" value={progreso.total} />
      </View>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{(value || 0).toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DiariaCard({ data, titulo }) {
  return (
    <View style={styles.diariaCard}>
      <Text style={styles.diariaTitle}>{titulo}</Text>
      {data.fecha_sorteo && (
        <View style={styles.diariaRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.diariaText}>Sorteo: {data.fecha_sorteo}</Text>
        </View>
      )}
      {data.loteria ? (
        <View style={styles.diariaRow}>
          <Ionicons name="dice-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.diariaText}>Loteria: {data.loteria}</Text>
        </View>
      ) : null}
      {data.progreso && (
        <>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${data.progreso.porcentaje || 0}%` }]} />
          </View>
          <Text style={styles.diariaStats}>
            {data.progreso.vendidas}/{data.progreso.total} vendidas ({data.progreso.porcentaje}%)
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  heroRifaNum: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  premioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  premioIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  premioInfo: { flex: 1 },
  premioNombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  premioDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  premioValor: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  progresoCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  progresoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  progresoLabel: { flex: 1, fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  progresoPct: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  progressBar: { height: 6, backgroundColor: colors.surface, borderRadius: 3, marginBottom: spacing.sm },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  progresoStats: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  diariaCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  diariaTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  diariaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  diariaText: { fontSize: fontSize.sm, color: colors.textSecondary },
  diariaStats: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
});
