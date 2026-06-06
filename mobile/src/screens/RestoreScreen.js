import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import axios from 'axios';

import { useAuth } from '../context/AuthContext';
import { API_URL } from '../services/authService';
import colors from '../theme/colors';
import BackupCard from '../components/BackupCard';
import ProgressBar from '../components/ProgressBar';
import { getBackupFiles, restoreFiles } from '../services/backupService';

const FILTERS = [
  { id: 'all',     label: 'Todos' },
  { id: 'cloud',   label: 'Nube' },
  { id: 'sd_card', label: 'SD' },
  { id: 'usb',     label: 'USB' },
  { id: 'hdd',     label: 'Disco' },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function RestoreScreen() {
  const { token } = useAuth();
  const [backups, setBackups] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [checkedFiles, setCheckedFiles] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreDone, setRestoreDone] = useState(false);

  useEffect(() => { fetchBackups(); }, []);

  async function fetchBackups() {
    try {
      const res = await axios.get(`${API_URL}/backups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackups(res.data.backups || []);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los backups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => { setRefreshing(true); fetchBackups(); }, []);

  const filtered = filter === 'all'
    ? backups
    : backups.filter((b) => b.destination_type === filter);

  async function openDetail(backup) {
    setSelected(backup);
    setDetail(null);
    setModalVisible(true);
    setCheckedFiles([]);
    setRestoring(false);
    setRestoreDone(false);

    try {
      const data = await getBackupFiles(token, backup.id);
      setDetail(data);
      setCheckedFiles((data.files || []).map((f) => f.id));
    } catch {
      Alert.alert('Error', 'No se pudo cargar el detalle del backup.');
      setModalVisible(false);
    }
  }

  function toggleFile(id) {
    setCheckedFiles((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  }

  async function handleRestore() {
    if (checkedFiles.length === 0) {
      Alert.alert('Seleccioná archivos', 'Elegí al menos un archivo para restaurar.');
      return;
    }
    setRestoring(true);
    setRestoreProgress(0);
    try {
      const res = await restoreFiles(token, selected.id, checkedFiles, ({ percent }) => {
        setRestoreProgress(percent);
      });
      setRestoreDone(true);
      const msg = res.errors.length > 0
        ? `${res.restored.length} restaurados, ${res.errors.length} con error.`
        : `${res.restored.length} archivos restaurados correctamente.`;
      Alert.alert('Restauración completa', msg);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(backup) {
    try {
      await axios.delete(`${API_URL}/backups/${backup.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackups((prev) => prev.filter((b) => b.id !== backup.id));
    } catch {
      Alert.alert('Error', 'No se pudo eliminar el backup.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Restaurar Backup</Text>
        <Text style={styles.headerSub}>
          {backups.length} backup{backups.length !== 1 ? 's' : ''} guardado{backups.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, filter === f.id && styles.chipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={styles.loadingCenter} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <BackupCard backup={item} onPress={openDetail} onDelete={handleDelete} />
          )}
          contentContainerStyle={[styles.list, filtered.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialIcons name="cloud-off" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>Sin backups</Text>
              <Text style={styles.emptySub}>
                Todavía no hiciste ningún backup.{'\n'}Andá a la pestaña Backup para empezar.
              </Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.modal} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{selected?.name}</Text>
          </View>

          {!detail ? (
            <ActivityIndicator style={styles.loadingCenter} color={colors.primary} size="large" />
          ) : (
            <>
              <View style={styles.detailInfo}>
                <Text style={styles.detailMeta}>
                  {formatDate(selected?.backup_date || selected?.created_at)}
                  {' · '}
                  {formatBytes(selected?.size_bytes)}
                  {' · '}
                  {detail.files?.length || 0} archivos
                </Text>
              </View>

              {restoring && (
                <View style={styles.restoreProgress}>
                  <ProgressBar progress={restoreProgress} label="Restaurando archivos..." color={colors.secondary} />
                </View>
              )}

              <View style={styles.fileListHeader}>
                <Text style={styles.fileListTitle}>Archivos</Text>
                <TouchableOpacity onPress={() => setCheckedFiles((detail.files || []).map((f) => f.id))}>
                  <Text style={styles.selectAll}>Seleccionar todo</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={detail.files || []}
                keyExtractor={(f) => f.id}
                contentContainerStyle={styles.fileList}
                ListEmptyComponent={
                  <Text style={styles.noFiles}>No hay archivos en este backup de nube.</Text>
                }
                renderItem={({ item }) => {
                  const checked = checkedFiles.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={styles.fileRow}
                      onPress={() => toggleFile(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.fileCheck, checked && styles.fileCheckOn]}>
                        {checked && <MaterialIcons name="check" size={12} color="#fff" />}
                      </View>
                      <MaterialIcons name="insert-drive-file" size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>{item.file_name}</Text>
                        <Text style={styles.fileSize}>{formatBytes(item.file_size)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.restoreBtn, (restoring || restoreDone) && styles.restoreBtnDisabled]}
                  onPress={handleRestore}
                  disabled={restoring || restoreDone}
                >
                  {restoring
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <MaterialIcons name={restoreDone ? 'check' : 'cloud-download'} size={20} color="#fff" />
                  }
                  <Text style={styles.restoreBtnText}>
                    {restoreDone ? 'Restaurado' : `Restaurar (${checkedFiles.length})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  list: { padding: 16, paddingBottom: 32 },
  loadingCenter: { flex: 1, marginTop: 60 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 16 },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  closeBtn: { marginRight: 12, padding: 4 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  detailInfo: { padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailMeta: { fontSize: 13, color: colors.textSecondary },
  restoreProgress: { margin: 16 },
  fileListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  fileListTitle: { fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  selectAll: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  fileList: { paddingHorizontal: 16, paddingBottom: 16 },
  noFiles: { textAlign: 'center', color: colors.textSecondary, marginTop: 24, fontSize: 14 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  fileCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  fileCheckOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '600', color: colors.text },
  fileSize: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  modalFooter: { padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 14 },
  restoreBtnDisabled: { opacity: 0.6 },
  restoreBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
