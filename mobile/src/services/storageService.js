import * as FileSystem from 'expo-file-system';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';

// Known WhatsApp folder paths on Android
const WHATSAPP_PATHS = [
  '/storage/emulated/0/WhatsApp/',
  '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/',
  '/sdcard/WhatsApp/',
];

export const storageService = {
  /**
   * Request READ/WRITE external storage permissions on Android.
   * On iOS, these permissions are not required.
   */
  async requestStoragePermission() {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);

      return (
        granted[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn('Storage permission error:', err);
      return false;
    }
  },

  /**
   * List accessible external storage volumes (SD card, USB).
   * Uses StorageAccessFramework on Android.
   */
  async getExternalStorageDirectories() {
    if (Platform.OS !== 'android') {
      // iOS doesn't expose external volumes directly
      return [];
    }

    try {
      const dirs = await FileSystem.StorageAccessFramework.readDirectoryAsync(
        FileSystem.documentDirectory
      ).catch(() => []);

      // Return base external paths
      const externalDirs = [
        FileSystem.documentDirectory,
        FileSystem.cacheDirectory,
      ].filter(Boolean);

      return externalDirs;
    } catch (err) {
      console.warn('getExternalStorageDirectories error:', err);
      return [];
    }
  },

  /**
   * Open SAF directory picker for SD/USB access.
   * Returns the granted directory URI or null if cancelled.
   */
  async requestDirectoryAccess() {
    try {
      if (Platform.OS !== 'android') {
        return null;
      }

      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        return permissions.directoryUri;
      }
      return null;
    } catch (err) {
      console.warn('requestDirectoryAccess error:', err);
      return null;
    }
  },

  /**
   * Write a file to a SAF-granted directory.
   * Returns the URI of the created file.
   */
  async writeFileToDirectory(directoryUri, fileName, content) {
    try {
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        fileName,
        'application/octet-stream'
      );

      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return fileUri;
    } catch (err) {
      console.error('writeFileToDirectory error:', err);
      throw new Error(`No se pudo escribir el archivo: ${err.message}`);
    }
  },

  /**
   * Read a file from a SAF-accessible directory.
   * Returns the content as a Base64 string.
   */
  async readFileFromDirectory(directoryUri, fileName) {
    try {
      const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
      const fileUri = files.find((f) => f.endsWith(fileName));

      if (!fileUri) {
        throw new Error(`Archivo no encontrado: ${fileName}`);
      }

      const content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return content;
    } catch (err) {
      console.error('readFileFromDirectory error:', err);
      throw new Error(`No se pudo leer el archivo: ${err.message}`);
    }
  },

  /**
   * Get device storage info: total, free, external availability.
   */
  async getDeviceStorageInfo() {
    try {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      const totalSpace = await FileSystem.getTotalDiskCapacityAsync();

      return {
        totalSpace,
        freeSpace,
        externalAvailable: Platform.OS === 'android',
      };
    } catch (err) {
      console.warn('getDeviceStorageInfo error:', err);
      return {
        totalSpace: 0,
        freeSpace: 0,
        externalAvailable: false,
      };
    }
  },

  /**
   * Return device hardware and OS information using expo-device.
   */
  async getDeviceInfo() {
    return {
      deviceName: Device.deviceName || 'Dispositivo desconocido',
      brand: Device.brand || 'Desconocido',
      modelName: Device.modelName || 'Modelo desconocido',
      osName: Device.osName || Platform.OS,
      osVersion: Device.osVersion || 'Versión desconocida',
    };
  },

  /**
   * Detect if WhatsApp is installed by checking known storage paths.
   * Returns { detected: bool, path: string|null }
   */
  async detectWhatsApp() {
    for (const path of WHATSAPP_PATHS) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && info.isDirectory) {
          return { detected: true, path };
        }
      } catch {
        // Try next path
      }
    }
    return { detected: false, path: null };
  },

  /**
   * Scan WhatsApp folder and return list of backup-able files.
   * Covers: Databases (chats), Media (fotos/videos/docs), Backups.
   */
  async scanWhatsApp(whatsappPath) {
    const results = [];
    const subdirs = ['Databases', 'Media', 'Backups'];

    for (const subdir of subdirs) {
      const dirPath = `${whatsappPath}${subdir}/`;
      try {
        const info = await FileSystem.getInfoAsync(dirPath);
        if (!info.exists) continue;
        const files = await FileSystem.readDirectoryAsync(dirPath);
        for (const file of files) {
          const filePath = `${dirPath}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(filePath, { size: true }).catch(() => ({}));
          results.push({
            uri: filePath,
            name: `WhatsApp_${subdir}_${file}`,
            originalName: file,
            size: fileInfo.size || 0,
            type: 'whatsapp',
            category: subdir,
          });
        }
      } catch {
        // Skip inaccessible subdirectory
      }
    }

    return results;
  },
};

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
