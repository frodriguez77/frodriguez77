import * as MediaLibrary from 'expo-media-library';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';

export const API_URL = 'http://localhost:3000/api';

function buildHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function getErrorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error;
  if (err.message === 'Network Error')
    return 'No se pudo conectar al servidor.';
  return err.message || 'Error inesperado.';
}

// ─── Scan helpers ─────────────────────────────────────────────────────────────

/**
 * Scan the media library for photos and videos.
 * Returns an array of { uri, filename, fileSize, mediaType }.
 */
export async function scanPhotos() {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permiso de galería denegado. Habilitalo en los ajustes del dispositivo.');
  }

  const results = [];
  let after = undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: 200,
      after,
    });

    for (const asset of page.assets) {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id).catch(() => null);
      results.push({
        uri: info?.localUri || asset.uri,
        filename: asset.filename,
        fileSize: asset.fileSize || 0,
        mediaType: asset.mediaType,
      });
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return results;
}

/**
 * Fetch all contacts from the device.
 * Returns a JSON-serializable array.
 */
export async function scanContacts() {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permiso de contactos denegado. Habilitalo en los ajustes del dispositivo.');
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Addresses,
      Contacts.Fields.Birthday,
      Contacts.Fields.Company,
    ],
  });

  return data.map((c) => ({
    id: c.id,
    name: c.name || '',
    phoneNumbers: c.phoneNumbers || [],
    emails: c.emails || [],
    addresses: c.addresses || [],
    company: c.company || '',
    birthday: c.birthday || null,
  }));
}

/**
 * Open the document picker and let the user choose files.
 * Returns an array of { uri, name, size, mimeType }.
 */
export async function scanDocuments() {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    size: a.size || 0,
    mimeType: a.mimeType || 'application/octet-stream',
  }));
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function createBackupRecord(token, deviceId, backupData) {
  try {
    const res = await axios.post(
      `${API_URL}/backups`,
      { device_id: deviceId, ...backupData },
      { headers: buildHeaders(token) }
    );
    return res.data.backup;
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
}

export async function updateBackupRecord(token, backupId, updates) {
  try {
    const res = await axios.patch(
      `${API_URL}/backups/${backupId}`,
      updates,
      { headers: buildHeaders(token) }
    );
    return res.data.backup;
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
}

/**
 * Upload a single file to the cloud backup endpoint.
 * Uses FormData + axios with upload progress tracking.
 */
export async function uploadFileToCloud(token, backupId, fileUri, fileName, onProgress) {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: 'application/octet-stream',
    });
    formData.append('original_path', fileUri);

    const res = await axios.post(
      `${API_URL}/backups/${backupId}/files`,
      formData,
      {
        headers: {
          ...buildHeaders(token),
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress(progressEvent.loaded / progressEvent.total);
          }
        },
      }
    );
    return res.data.file;
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
}

export async function getBackupFiles(token, backupId) {
  try {
    const res = await axios.get(`${API_URL}/backups/${backupId}`, {
      headers: buildHeaders(token),
    });
    return res.data;
  } catch (err) {
    throw new Error(getErrorMessage(err));
  }
}

// ─── Local storage helpers ────────────────────────────────────────────────────

/**
 * Write a file to a local directory using the File System API.
 */
async function writeLocalFile(directoryUri, fileName, content) {
  const fileUri = `${directoryUri}/${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Perform a full backup operation.
 *
 * options:
 *   types       string[]   — e.g. ['photos', 'contacts', 'documents']
 *   destination string     — 'cloud' | 'sd_card' | 'usb' | 'local'
 *   backupId    string     — ID of the already-created backup record
 *   deviceId    string
 *   token       string
 *   backupName  string
 *   onProgress  function({ current, total, fileName, percent })
 *
 * Returns { filesProcessed, totalSize, errors }
 */
export async function performBackup(options) {
  const { types, destination, backupId, token, onProgress } = options;

  let allFiles = [];
  const errors = [];

  // ── Step 1: collect files to back up ────────────────────────────────────────

  if (types.includes('photos')) {
    try {
      const photos = await scanPhotos();
      allFiles = allFiles.concat(
        photos.map((p) => ({ uri: p.uri, name: p.filename, size: p.fileSize, type: 'photo' }))
      );
    } catch (err) {
      errors.push(`Fotos: ${err.message}`);
    }
  }

  if (types.includes('contacts')) {
    try {
      const contacts = await scanContacts();
      const jsonStr = JSON.stringify(contacts, null, 2);
      const blob = `data:application/json;base64,${btoa(unescape(encodeURIComponent(jsonStr)))}`;
      allFiles.push({ uri: blob, name: 'contacts.json', size: jsonStr.length, type: 'contacts', isJson: true, jsonContent: jsonStr });
    } catch (err) {
      errors.push(`Contactos: ${err.message}`);
    }
  }

  if (types.includes('documents')) {
    try {
      const docs = await scanDocuments();
      allFiles = allFiles.concat(
        docs.map((d) => ({ uri: d.uri, name: d.name, size: d.size, type: 'document' }))
      );
    } catch (err) {
      errors.push(`Documentos: ${err.message}`);
    }
  }

  const total = allFiles.length;
  let filesProcessed = 0;
  let totalSize = 0;

  if (total === 0 && errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  // ── Step 2: process and store each file ─────────────────────────────────────

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];

    try {
      onProgress?.({
        current: i + 1,
        total,
        fileName: file.name,
        percent: (i + 1) / total,
      });

      if (destination === 'cloud') {
        if (file.isJson) {
          // Write JSON to cache then upload
          const cacheUri = `${FileSystem.cacheDirectory}${file.name}`;
          await FileSystem.writeAsStringAsync(cacheUri, file.jsonContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          await uploadFileToCloud(token, backupId, cacheUri, file.name, null);
          await FileSystem.deleteAsync(cacheUri, { idempotent: true });
        } else {
          await uploadFileToCloud(token, backupId, file.uri, file.name, null);
        }
      }
      // For sd_card/usb/local, the app needs SAF directory URI which is collected
      // in the UI layer; here we just count the files and sizes.

      filesProcessed++;
      totalSize += file.size || 0;
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  // Update backup record with final stats
  try {
    await updateBackupRecord(token, backupId, {
      status: errors.length === allFiles.length && allFiles.length > 0 ? 'failed' : 'completed',
      file_count: filesProcessed,
      size_bytes: totalSize,
    });
  } catch (_) {
    // Non-fatal
  }

  return { filesProcessed, totalSize, errors };
}

// ─── Restore helpers ──────────────────────────────────────────────────────────

/**
 * Restore selected files from a cloud backup.
 * Downloads each file to the device's documents directory.
 *
 * options: { token, backupId, selectedFileIds, onProgress }
 */
export async function restoreFiles(token, backupId, selectedFileIds, onProgress) {
  const total = selectedFileIds.length;
  const restored = [];
  const errors = [];

  for (let i = 0; i < selectedFileIds.length; i++) {
    const fileId = selectedFileIds[i];

    try {
      const downloadUrl = `${API_URL}/backups/${backupId}/files/${fileId}/download`;
      const destUri = `${FileSystem.documentDirectory}restored_${fileId}`;

      onProgress?.({ current: i + 1, total, percent: (i + 1) / total });

      const result = await FileSystem.downloadAsync(downloadUrl, destUri, {
        headers: buildHeaders(token),
      });

      restored.push({ fileId, localUri: result.uri });
    } catch (err) {
      errors.push({ fileId, error: err.message });
    }
  }

  return { restored, errors };
}
