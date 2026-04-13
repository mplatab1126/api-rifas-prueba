import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { enviarComprobante } from '../lib/api';
import { formatMoney } from '../lib/format';

const PLATAFORMAS = ['Nequi', 'Daviplata', 'Bancolombia'];

export default function EnviarComprobanteScreen({ route, navigation }) {
  const { numero, tipo, saldo } = route.params;
  const [plataforma, setPlataforma] = useState(null);
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!plataforma) {
      Alert.alert('Error', 'Selecciona por donde pagaste');
      return;
    }
    const montoNum = Number(monto.replace(/\D/g, ''));
    if (!montoNum || montoNum <= 0) {
      Alert.alert('Error', 'Ingresa el monto que pagaste');
      return;
    }

    setEnviando(true);
    try {
      await enviarComprobante({
        numero_boleta: numero,
        tipo,
        monto: montoNum,
        plataforma,
        referencia: referencia.trim() || undefined,
        nota: nota.trim() || undefined,
      });
      Alert.alert(
        'Comprobante enviado',
        'Un asesor revisara tu pago pronto. Te notificaremos cuando sea registrado.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Info de la boleta */}
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Boleta</Text>
        <Text style={styles.infoNumero}>{numero}</Text>
        <Text style={styles.infoSaldo}>Saldo pendiente: {formatMoney(saldo)}</Text>
      </View>

      {/* Plataforma */}
      <Text style={styles.label}>Por donde pagaste?</Text>
      <View style={styles.plataformaRow}>
        {PLATAFORMAS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.plataformaBtn, plataforma === p && styles.plataformaBtnActive]}
            onPress={() => setPlataforma(p)}
          >
            <Text style={[styles.plataformaText, plataforma === p && styles.plataformaTextActive]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Monto */}
      <Text style={styles.label}>Cuanto pagaste?</Text>
      <View style={styles.montoRow}>
        <Text style={styles.montoPrefix}>$</Text>
        <TextInput
          style={styles.montoInput}
          placeholder="50000"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={monto}
          onChangeText={setMonto}
        />
      </View>

      {/* Referencia */}
      <Text style={styles.label}>Numero de referencia (opcional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: 123456789"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={referencia}
        onChangeText={setReferencia}
      />

      {/* Nota */}
      <Text style={styles.label}>Nota adicional (opcional)</Text>
      <TextInput
        style={[styles.input, styles.notaInput]}
        placeholder="Ej: Pague desde la cuenta de mi mama"
        placeholderTextColor={colors.textMuted}
        value={nota}
        onChangeText={setNota}
        multiline
      />

      {/* Boton enviar */}
      <TouchableOpacity
        style={[styles.enviarBtn, enviando && styles.enviarBtnDisabled]}
        onPress={enviar}
        disabled={enviando}
      >
        {enviando ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <>
            <Ionicons name="send" size={20} color={colors.background} />
            <Text style={styles.enviarText}>Enviar comprobante</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.aviso}>
        Un asesor verificara tu pago y lo registrara en tu boleta. Te avisaremos por notificacion cuando este listo.
      </Text>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  infoCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.lg, alignItems: 'center', marginTop: spacing.lg,
    borderWidth: 1, borderColor: colors.primary + '33',
  },
  infoLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  infoNumero: { fontSize: fontSize.hero, fontWeight: '800', color: colors.primary, marginVertical: spacing.xs },
  infoSaldo: { fontSize: fontSize.sm, color: colors.warning },
  label: {
    fontSize: fontSize.md, fontWeight: '600', color: colors.text,
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  plataformaRow: { flexDirection: 'row', gap: spacing.sm },
  plataformaBtn: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center',
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  plataformaBtnActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  plataformaText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  plataformaTextActive: { color: colors.background },
  montoRow: { flexDirection: 'row', alignItems: 'center' },
  montoPrefix: {
    fontSize: fontSize.xl, fontWeight: '700', color: colors.primary, marginRight: spacing.sm,
  },
  montoInput: {
    flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: fontSize.md, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  notaInput: { minHeight: 80, textAlignVertical: 'top' },
  enviarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.md, marginTop: spacing.xl, gap: spacing.sm,
  },
  enviarBtnDisabled: { opacity: 0.6 },
  enviarText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.background },
  aviso: {
    textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted,
    marginTop: spacing.md, lineHeight: 18, paddingHorizontal: spacing.md,
  },
});
