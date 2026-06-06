import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';
import StepIndicator from '../components/StepIndicator';
import ProgressBar from '../components/ProgressBar';
import { storageService } from '../services/storageService';
import { createBackupRecord, performBackup } from '../services/backupService';

const STEPS = ['Qué guardar', 'Dónde', 'Resumen', 'Progreso'];

const BACKUP_TYPES = [
  { id: 'photos',    label: 'Fotos y Videos',        icon: 'photo-library', color: '#8B5CF6', desc: 'Toda tu galería' },
  { id: 'contacts',  label: 'Contactos',              icon: 'contacts',      color: '#10B981', desc: 'Agenda completa' },
  { id: 'documents', label: 'Documentos',             icon: 'folder',        color: '#F59E0B', desc: 'PDFs, Word, Excel...' },
  { id: 'whatsapp',  label: 'WhatsApp',               icon: 'chat',          color: '#25D366', desc: 'Chats, fotos y archivos' },
  { id: 'apps',      label: 'Lista de apps',          icon: 'apps',          color: '#6366F1', desc: 'Qué apps tenés instaladas' },
  { id: 'all',       label: 'Todo el almacenamiento', icon: 'storage',       color: '#EF4444', desc: 'Backup completo del celular' },
];

const DESTINATIONS = [
  { id: 'cloud',   label: 'Nube SafeBackup',  icon: 'cloud',      color: colors.primary, desc: 'Accesible desde cualquier lugar' },
  { id: 'sd_card', label: 'Tarjeta SD',       icon: 'sd-storage', color: '#10B981',      desc: 'Memoria SD interna del celular' },
  { id: 'usb',     label: 'Pendrive / USB',   icon: 'usb',        color: '#F59E0B',      desc: 'Conectado por USB-OTG' },
  { id: 'hdd',     label: 'Disco Externo',    icon: 'album',      color: '#8B5CF6',      desc: 'Disco duro o SSD externo por USB' },
];

export default function BackupScreen() {
  const { token } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [backupName, setBackupName] = useState('');
  const [notes, setNotes] = useState('');
  const [whatsappDetected, setWhatsappDetected] = useState(false);
  const [whatsappPath, setWhatsappPath] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressSub, setProgressSub] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    autoDetectWhatsApp();
    loadDeviceId();
    setBackupName(`Backup ${new Date().toLocaleDateString('es-AR')}`);
  }, []);

  async function autoDetectWhatsApp() {
    const wa = await storageService.detectWhatsApp();
    setWhatsappDetected(wa.detected);
    if (wa.detected) setWhatsappPath(wa.path);
  }

  async function loadDeviceId() {
    try {
      const id = await AsyncStorage.getItem('device_id');
      setDeviceId(id);
    } catch { /* ignore */ }
  }

  function toggleType(id) {
    if (id === 'all') {
      setSelectedTypes(['all']);
      return;
    }
    setSelectedTypes((prev) => {
      const filtered = prev.filter((t) => t !== 'all');
      return filtered.includes(id) ? filtered.filter((t) => t !== id) : [...filtered, id];
    });
  }

  function goNext() {
    if (step === 1 && selectedTypes.length === 0) {
      Alert.alert('Seleccioná qué guardar', 'Elegí al menos una categoría.');
      return;
    }
    if (step === 2 && !selectedDest) {
      Alert.alert('Seleccioná un destino', 'Elegí dónde querés guardar el backup.');
      return;
    }
    setStep((s) => s + 1);
  }

  function goBack() {
    if (step === 1) return;
    setStep((s) => s - 1);
  }

  function reset() {
    setStep(1);
    setSelectedTypes([]);
    setSelectedDest(null);
    setBackupName(`Backup ${new Date().toLocaleDateString('es-AR')}`);
    setNotes('');
    setProgress(0);
    setProgressLabel('');
    setProgressSub('');
    setIsDone(false);
    setResult(null);
    setLoading(false);
  }

  async function startBackup() {
    setStep(4);
    setLoading(true);
    setProgress(0);

    try {
      // Request external directory access for SD/USB/HDD
      let directoryUri = null;
      if (['sd_card', 'usb', 'hdd'].includes(selectedDest) && Platform.OS === 'android') {
        const access = await storageService.requestDirectoryAccess();
        if (!access) {
          Alert.alert(
            'Permiso denegado',
            'Necesitás autorizar el acceso al almacenamiento externo para guardar el backup.'
          );
          setStep(2);
          setLoading(false);
          return;
        }
        directoryUri = access;
      }

      const record = await createBackupRecord(token, deviceId, {
        name: backupName,
        destination_type: selectedDest,
        notes,
        backup_date: new Date().toISOString(),
      });

      const res = await performBackup({
        types: selectedTypes,
        destination: selectedDest,
        backupId: record.id,
        deviceId,
        token,
        backupName,
        directoryUri,
        whatsappPath: selectedTypes.includes('whatsapp') ? whatsappPath : null,
        onProgress: ({ current, total, fileName, percent }) => {
          setProgress(percent);
          setProgressLabel(`Procesando ${current} de ${total}`);
          setProgressSub(fileName || '');
        },
      });

      setResult(res);
      setIsDone(true);
    } catch (err) {
      Alert.alert('Error en el backup', err.message, [
        { text: 'Reintentar', onPress: () => { setStep(3); setLoading(false); } },
        { text: 'Cancelar', onPress: reset },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Step renders ──────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent}>
        <Text style={styles.stepTitle}>¿Qué querés guardar?</Text>
        <Text style={styles.stepSubtitle}>Podés elegir varias categorías</Text>

        {whatsappDetected && (
          <View style={styles.detectedBadge}>
            <MaterialIcons name="check-circle" size={16} color="#25D366" />
            <Text style={styles.detectedText}>WhatsApp detectado — podés incluirlo en el backup</Text>
          </View>
        )}

        {BACKUP_TYPES.map((type) => {
          if (type.id === 'whatsapp' && !whatsappDetected) return null;
          const selected = selectedTypes.includes(type.id);
          return (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeCard, selected && { borderColor: type.color, borderWidth: 2 }]}
              onPress={() => toggleType(type.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: type.color + '20' }]}>
                <MaterialIcons name={type.icon} size={26} color={type.color} />
              </View>
              <View style={styles.typeInfo}>
                <Text style={styles.typeLabel}>{type.label}</Text>
                <Text style={styles.typeDesc}>{type.desc}</Text>
              </View>
              <View style={[styles.checkbox, selected && { backgroundColor: type.color, borderColor: type.color }]}>
                {selected && <MaterialIcons name="check" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  function renderStep2() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent}>
        <Text style={styles.stepTitle}>¿Dónde querés guardar?</Text>
        <Text style={styles.stepSubtitle}>Elegí el destino del backup</Text>

        {DESTINATIONS.map((dest) => {
          const selected = selectedDest === dest.id;
          return (
            <TouchableOpacity
              key={dest.id}
              style={[styles.destCard, selected && { borderColor: dest.color, borderWidth: 2 }]}
              onPress={() => setSelectedDest(dest.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.destIcon, { backgroundColor: dest.color + '20' }]}>
                <MaterialIcons name={dest.icon} size={28} color={dest.color} />
              </View>
              <View style={styles.destInfo}>
                <Text style={styles.destLabel}>{dest.label}</Text>
                <Text style={styles.destDesc}>{dest.desc}</Text>
              </View>
              {selected && (
                <View style={[styles.selectedDot, { backgroundColor: dest.color }]}>
                  <MaterialIcons name="check" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {(selectedDest === 'sd_card' || selectedDest === 'usb' || selectedDest === 'hdd') && (
          <View style={styles.infoBox}>
            <MaterialIcons name="info" size={16} color={colors.primary} />
            <Text style={styles.infoText}>
              Se te va a pedir que selecciones la carpeta en el almacenamiento externo donde guardar el backup.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderStep3() {
    const destMeta = DESTINATIONS.find((d) => d.id === selectedDest);
    const selectedLabels = BACKUP_TYPES.filter((t) => selectedTypes.includes(t.id)).map((t) => t.label);

    return (
      <ScrollView contentContainerStyle={styles.stepContent}>
        <Text style={styles.stepTitle}>Resumen del backup</Text>

        <Text style={styles.inputLabel}>Nombre del backup</Text>
        <TextInput
          style={styles.input}
          value={backupName}
          onChangeText={setBackupName}
          placeholder="Ej: Backup junio 2025"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.inputLabel}>Notas (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej: Antes de cambiar el celular..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
        />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Qué se va a guardar</Text>
          {selectedLabels.map((l) => (
            <View key={l} style={styles.summaryRow}>
              <MaterialIcons name="check" size={16} color={colors.success} />
              <Text style={styles.summaryText}>{l}</Text>
            </View>
          ))}
        </View>

        {destMeta && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Destino</Text>
            <View style={styles.summaryRow}>
              <MaterialIcons name={destMeta.icon} size={16} color={destMeta.color} />
              <Text style={styles.summaryText}>{destMeta.label}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderStep4() {
    if (isDone) {
      return (
        <View style={styles.doneContainer}>
          <MaterialIcons name="check-circle" size={80} color={colors.success} />
          <Text style={styles.doneTitle}>¡Backup completado!</Text>
          <Text style={styles.doneSub}>
            {result?.filesProcessed || 0} archivos guardados correctamente
          </Text>
          {(result?.errors?.length || 0) > 0 && (
            <Text style={styles.doneWarning}>
              {result.errors.length} archivo(s) con error
            </Text>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={reset}>
            <Text style={styles.doneBtnText}>Nuevo backup</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.progressContainer}>
        <MaterialIcons name="cloud-upload" size={48} color={colors.primary} />
        <Text style={styles.progressTitle}>Guardando tu backup...</Text>
        <ProgressBar
          progress={progress}
          label={progressLabel}
          sublabel={progressSub}
          color={colors.primary}
        />
        {loading && <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nuevo Backup</Text>
      </View>

      <StepIndicator currentStep={step} steps={STEPS} />

      <View style={styles.body}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </View>

      {step < 4 && (
        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <MaterialIcons name="arrow-back" size={18} color={colors.text} />
              <Text style={styles.backBtnText}>Anterior</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, step === 1 && { flex: 1 }]}
            onPress={step === 3 ? startBackup : goNext}
          >
            <Text style={styles.nextBtnText}>
              {step === 3 ? 'Iniciar Backup' : 'Siguiente'}
            </Text>
            <MaterialIcons
              name={step === 3 ? 'cloud-upload' : 'arrow-forward'}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { flex: 1 },
  stepContent: { padding: 16, paddingBottom: 32 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
  detectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#D1FAE5', borderRadius: 8, padding: 10, marginBottom: 12,
  },
  detectedText: { fontSize: 13, color: '#065F46', fontWeight: '600', flex: 1 },
  typeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  typeIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  typeInfo: { flex: 1 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  typeDesc: { fontSize: 12, color: colors.textSecondary },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  destCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  destIcon: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  destInfo: { flex: 1 },
  destLabel: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 },
  destDesc: { fontSize: 12, color: colors.textSecondary },
  selectedDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: colors.primaryLight, borderRadius: 10, padding: 12, marginTop: 4,
  },
  infoText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: colors.text,
  },
  inputMultiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 },
  summaryCard: {
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 14,
  },
  summaryTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  summaryText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.border,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14,
  },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  progressContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  progressTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  doneSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  doneWarning: { fontSize: 13, color: colors.warning },
  doneBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 12,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
