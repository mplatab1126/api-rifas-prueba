import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { numerosDisponibles, buscarNumero, reservarNumero } from '../lib/api';
import { formatMoney } from '../lib/format';

export default function ExplorarScreen({ navigation }) {
  const [tipo, setTipo] = useState('4cifras');
  const [numeros, setNumeros] = useState([]);
  const [totalDisponibles, setTotalDisponibles] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [reservando, setReservando] = useState(null);

  const cargar = async () => {
    setCargando(true);
    setResultadoBusqueda(null);
    setBusqueda('');
    try {
      const res = await numerosDisponibles(tipo, 30);
      setNumeros(res.numeros || []);
      setTotalDisponibles(res.total_disponibles || 0);
    } catch (err) {
      console.error('Error cargando numeros:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [tipo]);

  const hacerBusqueda = async () => {
    if (!busqueda.trim()) return;
    setCargando(true);
    try {
      const res = await buscarNumero(busqueda.trim(), tipo);
      setResultadoBusqueda(res);
    } catch (err) {
      setResultadoBusqueda({ numero: busqueda, disponible: false, estado: 'No encontrado' });
    } finally {
      setCargando(false);
    }
  };

  const hacerReserva = async (numero) => {
    Alert.alert(
      'Reservar numero',
      `Quieres reservar el numero ${numero}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reservar',
          onPress: async () => {
            setReservando(numero);
            try {
              const res = await reservarNumero(numero, tipo);
              Alert.alert(
                'Reservado!',
                `El numero ${numero} ya es tuyo. Recuerda hacer el pago.`,
                [{ text: 'Ver mis boletas', onPress: () => navigation.navigate('Inicio') }]
              );
              // Recargar lista
              cargar();
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setReservando(null);
            }
          },
        },
      ]
    );
  };

  const tipos = [
    { key: '4cifras', label: 'Principal' },
    { key: '2cifras', label: 'Diaria 2' },
    { key: '3cifras', label: 'Diaria 3' },
  ];

  return (
    <View style={styles.container}>
      {/* Selector de tipo */}
      <View style={styles.tipoSelector}>
        {tipos.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tipoBtn, tipo === t.key && styles.tipoBtnActive]}
            onPress={() => setTipo(t.key)}
          >
            <Text style={[styles.tipoText, tipo === t.key && styles.tipoTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Buscar numero...`}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={busqueda}
          onChangeText={setBusqueda}
          onSubmitEditing={hacerBusqueda}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={hacerBusqueda}>
          <Ionicons name="search" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Resultado de busqueda */}
      {resultadoBusqueda && (
        <View style={styles.searchResult}>
          <Text style={styles.searchNumero}>{resultadoBusqueda.numero}</Text>
          {resultadoBusqueda.disponible ? (
            <View style={styles.searchDisponible}>
              <Text style={styles.searchPrecio}>{formatMoney(resultadoBusqueda.precio)}</Text>
              <TouchableOpacity
                style={styles.reservarBtnSmall}
                onPress={() => hacerReserva(resultadoBusqueda.numero)}
              >
                <Text style={styles.reservarTextSmall}>Reservar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.searchNoDisp}>No disponible ({resultadoBusqueda.estado})</Text>
          )}
          <TouchableOpacity onPress={() => { setResultadoBusqueda(null); setBusqueda(''); }}>
            <Text style={styles.limpiarText}>Limpiar busqueda</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Contador */}
      <Text style={styles.contador}>
        {totalDisponibles} numeros disponibles
      </Text>

      {/* Lista de numeros */}
      {cargando ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={numeros}
          numColumns={3}
          keyExtractor={(item) => item.numero}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={cargar}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.numeroCard}
              onPress={() => hacerReserva(item.numero)}
              disabled={reservando === item.numero}
            >
              {reservando === item.numero ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Text style={styles.numeroText}>{item.numero}</Text>
                  <Text style={styles.precioText}>{formatMoney(item.precio)}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No hay numeros disponibles</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tipoSelector: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    padding: 3,
  },
  tipoBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  tipoBtnActive: {
    backgroundColor: colors.primary,
  },
  tipoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tipoTextActive: {
    color: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResult: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  searchNumero: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.primary,
  },
  searchDisponible: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  searchPrecio: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  reservarBtnSmall: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  reservarTextSmall: {
    color: colors.background,
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  searchNoDisp: {
    color: colors.danger,
    marginTop: spacing.sm,
  },
  limpiarText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  contador: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  numeroCard: {
    flex: 1,
    backgroundColor: colors.card,
    margin: spacing.xs,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 70,
    justifyContent: 'center',
  },
  numeroText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  precioText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
