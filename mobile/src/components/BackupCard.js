import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import colors from '../theme/colors';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Hace un momento';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;

  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined,
  });
}

const DESTINATION_META = {
  cloud:    { icon: 'cloud',        label: 'Nube',           color: colors.primary },
  sd_card:  { icon: 'sd-storage',  label: 'Tarjeta SD',     color: '#10B981' },
  usb:      { icon: 'usb',         label: 'USB',            color: '#F59E0B' },
  hdd:      { icon: 'album',       label: 'Disco Externo',  color: '#8B5CF6' },
  local:    { icon: 'phone-android',label: 'Local',         color: '#6366F1' },
};

const STATUS_META = {
  completed: { label: 'Completado', color: colors.success,   bg: '#D1FAE5' },
  failed:    { label: 'Fallido',    color: colors.danger,    bg: '#FEE2E2' },
  running:   { label: 'En progreso',color: colors.warning,   bg: '#FEF3C7' },
  pending:   { label: 'Pendiente',  color: colors.textSecondary, bg: colors.border },
};

export default function BackupCard({ backup, onPress, onDelete }) {
  const dest = DESTINATION_META[backup.destination_type] || DESTINATION_META.cloud;
  const status = STATUS_META[backup.status] || STATUS_META.pending;

  function handleLongPress() {
    Alert.alert(
      'Eliminar backup',
      `¿Seguro que querés eliminar "${backup.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDelete?.(backup) },
      ]
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(backup)}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: dest.color + '20' }]}>
          <MaterialIcons name={dest.icon} size={22} color={dest.color} />
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{backup.name}</Text>
          <Text style={styles.meta}>
            {formatDate(backup.backup_date || backup.created_at)}
            {' · '}
            {formatBytes(backup.size_bytes)}
            {' · '}
            {backup.file_count || 0} archivos
          </Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: dest.color + '20' }]}>
              <MaterialIcons name={dest.icon} size={10} color={dest.color} />
              <Text style={[styles.badgeText, { color: dest.color }]}>{dest.label}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>

        <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
