import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';
import { storageService } from '../services/storageService';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [storageInfo, setStorageInfo] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loadingLogout, setLoadingLogout] = useState(false);

  useEffect(() => { loadInfo(); }, []);

  async function loadInfo() {
    const [storage, device] = await Promise.all([
      storageService.getDeviceStorageInfo(),
      storageService.getDeviceInfo(),
    ]);
    setStorageInfo(storage);
    setDeviceInfo(device);
  }

  function getInitials(name = '') {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function handleLogout() {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que querés salir de tu cuenta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => { setLoadingLogout(true); await logout(); },
        },
      ]
    );
  }

  function comingSoon(feature) {
    Alert.alert('Próximamente', `"${feature}" estará disponible en la próxima versión.`);
  }

  const usedPercent = storageInfo && storageInfo.totalSpace > 0
    ? (storageInfo.freeSpace !== undefined
      ? (storageInfo.totalSpace - storageInfo.freeSpace) / storageInfo.totalSpace
      : 0)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Ajustes</Text>

        {/* Perfil */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => comingSoon('Editar perfil')}>
            <MaterialIcons name="edit" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Dispositivo */}
        <SectionTitle title="Dispositivo" />
        <View style={styles.card}>
          {deviceInfo ? (
            <>
              <InfoRow label="Modelo" value={`${deviceInfo.brand} ${deviceInfo.modelName}`} />
              <InfoRow label="Sistema" value={`${deviceInfo.osName} ${deviceInfo.osVersion}`} />
              <InfoRow label="Nombre" value={deviceInfo.deviceName} last />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />
          )}
        </View>

        {/* Almacenamiento */}
        <SectionTitle title="Almacenamiento del dispositivo" />
        <View style={styles.card}>
          {storageInfo ? (
            <>
              <View style={styles.storageBarWrap}>
                <View style={styles.storageBarTrack}>
                  <View style={[styles.storageBarFill, { width: `${Math.round(usedPercent * 100)}%` }]} />
                </View>
                <Text style={styles.storagePercent}>{Math.round(usedPercent * 100)}% usado</Text>
              </View>
              <InfoRow label="Libre" value={formatBytes(storageInfo.freeSpace)} />
              <InfoRow label="Total" value={formatBytes(storageInfo.totalSpace)} last />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />
          )}
        </View>

        {/* Cuenta */}
        <SectionTitle title="Mi cuenta" />
        <View style={styles.card}>
          <SettingRow icon="lock" label="Cambiar contraseña" onPress={() => comingSoon('Cambiar contraseña')} />
          <SettingRow icon="notifications" label="Notificaciones" onPress={() => comingSoon('Notificaciones')} />
          <SettingRow icon="schedule" label="Backup automático" onPress={() => comingSoon('Backup automático')} last />
        </View>

        {/* App */}
        <SectionTitle title="Sobre SafeBackup" />
        <View style={styles.card}>
          <InfoRow label="Versión" value="1.0.0" />
          <SettingRow icon="help-outline" label="Centro de ayuda" onPress={() => comingSoon('Centro de ayuda')} />
          <SettingRow icon="privacy-tip" label="Política de privacidad" onPress={() => comingSoon('Política de privacidad')} last />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loadingLogout}>
          {loadingLogout
            ? <ActivityIndicator color={colors.danger} size="small" />
            : <MaterialIcons name="logout" size={20} color={colors.danger} />
          }
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>SafeBackup © 2025</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, !last && styles.rowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SettingRow({ icon, label, onPress, last }) {
  return (
    <TouchableOpacity style={[styles.settingRow, !last && styles.rowBorder]} onPress={onPress} activeOpacity={0.7}>
      <MaterialIcons name={icon} size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
      <Text style={styles.settingLabel}>{label}</Text>
      <MaterialIcons name="chevron-right" size={18} color={colors.border} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 20 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  editBtn: { padding: 8 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 6, marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  settingLabel: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' },
  storageBarWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  storageBarTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 4 },
  storageBarFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  storagePercent: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.danger, paddingVertical: 14,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  footer: { textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginTop: 20 },
});
