import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { contacto } from '../lib/api';

export default function ContactoScreen() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      const res = await contacto();
      setData(res);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCargando(false);
    }
  };

  const abrirWhatsApp = (numero) => {
    if (!numero) return;
    const url = `https://wa.me/${numero.replace(/\D/g, '')}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir WhatsApp'));
  };

  const copiar = async (texto, label) => {
    await Clipboard.setStringAsync(texto);
    Alert.alert('Copiado', `${label} copiado al portapapeles`);
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
      {/* Header */}
      <View style={styles.headerCard}>
        <Ionicons name="headset" size={48} color={colors.primary} />
        <Text style={styles.headerTitle}>{data?.empresa || 'Los Plata S.A.S.'}</Text>
        <Text style={styles.headerSub}>{data?.horario || ''}</Text>
      </View>

      {/* WhatsApp */}
      <Text style={styles.sectionTitle}>WhatsApp</Text>
      {data?.whatsapp?.linea_1 && (
        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={() => abrirWhatsApp(data.whatsapp.linea_1)}
        >
          <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
          <View style={styles.whatsappInfo}>
            <Text style={styles.whatsappLabel}>Linea 1</Text>
            <Text style={styles.whatsappNum}>{data.whatsapp.linea_1}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
      {data?.whatsapp?.linea_2 && (
        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={() => abrirWhatsApp(data.whatsapp.linea_2)}
        >
          <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
          <View style={styles.whatsappInfo}>
            <Text style={styles.whatsappLabel}>Linea 2</Text>
            <Text style={styles.whatsappNum}>{data.whatsapp.linea_2}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {/* Cuentas de pago */}
      {data?.metodos_pago?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Cuentas para pagar</Text>
          {data.metodos_pago.map((mp, i) => (
            <TouchableOpacity
              key={i}
              style={styles.cuentaCard}
              onPress={() => copiar(mp.numero, mp.plataforma)}
            >
              <View style={styles.cuentaIcon}>
                <Ionicons name="wallet" size={22} color={colors.primary} />
              </View>
              <View style={styles.cuentaInfo}>
                <Text style={styles.cuentaPlataforma}>{mp.plataforma}</Text>
                <Text style={styles.cuentaNumero}>{mp.numero}</Text>
                <Text style={styles.cuentaTitular}>{mp.titular}</Text>
                {mp.tipo_cuenta && (
                  <Text style={styles.cuentaTipo}>{mp.tipo_cuenta}</Text>
                )}
              </View>
              <Ionicons name="copy-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
          <Text style={styles.copiarHint}>Toca una cuenta para copiar el numero</Text>
        </>
      )}

      {/* Redes sociales */}
      {(data?.redes_sociales?.instagram || data?.redes_sociales?.facebook) && (
        <>
          <Text style={styles.sectionTitle}>Redes sociales</Text>
          <View style={styles.redesRow}>
            {data.redes_sociales.instagram && (
              <TouchableOpacity
                style={styles.redBtn}
                onPress={() => Linking.openURL(data.redes_sociales.instagram)}
              >
                <Ionicons name="logo-instagram" size={28} color="#E1306C" />
                <Text style={styles.redLabel}>Instagram</Text>
              </TouchableOpacity>
            )}
            {data.redes_sociales.facebook && (
              <TouchableOpacity
                style={styles.redBtn}
                onPress={() => Linking.openURL(data.redes_sociales.facebook)}
              >
                <Ionicons name="logo-facebook" size={28} color="#1877F2" />
                <Text style={styles.redLabel}>Facebook</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Web */}
      {data?.web && (
        <TouchableOpacity
          style={styles.webBtn}
          onPress={() => Linking.openURL(data.web)}
        >
          <Ionicons name="globe-outline" size={20} color={colors.primary} />
          <Text style={styles.webText}>{data.web}</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    alignItems: 'center', backgroundColor: colors.card,
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    borderRadius: borderRadius.lg, paddingVertical: spacing.xl,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  headerSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '600', color: colors.text,
    marginHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md,
  },
  whatsappBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
    gap: spacing.md,
  },
  whatsappInfo: { flex: 1 },
  whatsappLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  whatsappNum: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  cuentaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  cuentaIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary + '22', justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  cuentaInfo: { flex: 1 },
  cuentaPlataforma: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  cuentaNumero: { fontSize: fontSize.md, color: colors.primary, fontWeight: '700', marginTop: 2 },
  cuentaTitular: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  cuentaTipo: { fontSize: fontSize.xs, color: colors.textMuted },
  copiarHint: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  redesRow: {
    flexDirection: 'row', marginHorizontal: spacing.lg, gap: spacing.md,
  },
  redBtn: {
    flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.md,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  redLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  webBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    paddingVertical: spacing.md, gap: spacing.sm,
  },
  webText: { color: colors.primary, fontSize: fontSize.md },
});
