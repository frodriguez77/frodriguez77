import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';

import { useAuth } from '../context/AuthContext';
import { storageService } from '../services/storageService';
import BackupCard from '../components/BackupCard';
import colors from '../theme/colors';

const API_URL = 'http://localhost:3000/api';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen({ navigation }) {
  const { user, token, logout } = useAuth();
  const [backups, setBackups] = useState([]);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setError('');
    try {
      // Get device info
      const info = await storageService.getDeviceInfo();
      setDeviceInfo(info);

      // Register device or get existing one
      const deviceRes = await axios.post(
        `${API_URL}/devices`,
        {
          device_name: info.deviceName,
          device_model: info.modelName,
          device_os: `${info.osName} ${info.osVersion}`,
        },
        { headers }
      );
      setDeviceId(deviceRes.data.device.id);

      // Fetch backups for this device
      const backupsRes = await axios.get(
        `${API_URL}/backups?device_id=${deviceRes.data.device.id}`,
        { headers }
      );
      setBackups(backupsRes.data.backups || []);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError('No se pudo cargar la información. Verificá tu conexión.');
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleDeleteBackup(backupId) {
    try {
      await axios.delete(`${API_URL}/backups/${backupId}`, { headers });
      setBackups((prev) => prev.filter((b) => b.id !== backupId));
    } catch (err) {
      Alert.alert('Error', 'No se pudo eliminar el backup.');
    }
  }

  const totalSize = backups.reduce((sum, b) => sum + (b.size_bytes || 0), 0);
  const totalFiles = backups.reduce((sum, b) => sum + (b.file_count || 0), 0);
  const lastBackup = backups[0];
  const recentBackups = backups.slice(0, 5);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{user?.name?.split(' ')[0] || 'Usuario'} 👋</Text>
          </View>
          <View style={styles.headerIcon}>
            <MaterialIcons name="cloud-done" size={28} color={colors.primary} />
          </View>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <MaterialIcons name="wifi-off" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Device Card */}
        {deviceInfo && (
          <View style={styles.deviceCard}>
            <View style={styles.deviceCardLeft}>
              <MaterialIcons name="smartphone" size={24} color={colors.primary} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.deviceName}>{deviceInfo.deviceName}</Text>
                <Text style={styles.deviceModel}>
                  {deviceInfo.brand} {deviceInfo.modelName} · {deviceInfo.osName} {deviceInfo.osVersion}
                </Text>
                {lastBackup ? (
                  <Text style={styles.lastBackupText}>
                    Último backup: {new Date(lastBackup.backup_date).toLocaleDateString('es-AR')}
                  </Text>
                ) : (
                  <Text style={styles.lastBackupText}>Sin backups todavía</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{backups.length}</Text>
            <Text style={styles.statLabel}>Backups</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMiddle]}>
            <Text style={styles.statValue}>{formatBytes(totalSize)}</Text>
            <Text style={styles.statLabel}>Guardado</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalFiles}</Text>
            <Text style={styles.statLabel}>Archivos</Text>
          </View>
        </View>

        {/* New Backup Button */}
        <TouchableOpacity
          style={styles.newBackupButton}
          onPress={() => navigation.navigate('Backup')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.newBackupButtonText}>Nuevo Backup</Text>
        </TouchableOpacity>

        {/* Recent Backups */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Backups recientes</Text>
          {backups.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate('Restore')}>
              <Text style={styles.seeAll}>Ver todos</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentBackups.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-queue" size={56} color={colors.border} />
            <Text style={styles.emptyTitle}>Sin backups todavía</Text>
            <Text style={styles.emptySubtitle}>
              Tocá "Nuevo Backup" para guardar tus archivos por primera vez.
            </Text>
          </View>
        ) : (
          recentBackups.map((backup) => (
            <BackupCard
              key={backup.id}
              backup={backup}
              onPress={() => navigation.navigate('Restore')}
              onDelete={() =>
                Alert.alert(
                  'Eliminar backup',
                  `¿Querés eliminar "${backup.name}"? Esta acción no se puede deshacer.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Eliminar',
                      style: 'destructive',
                      onPress: () => handleDeleteBackup(backup.id),
                    },
                  ]
                )
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 15,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    flex: 1,
  },
  deviceCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  deviceCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  deviceModel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  lastBackupText: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statCardMiddle: {
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  newBackupButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  newBackupButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
