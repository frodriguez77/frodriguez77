const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';

// Multer storage: files go into uploads/<backup_id>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const backupId = req.params.id;
    const dir = path.resolve(path.join(UPLOADS_PATH, backupId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but prefix with uuid to avoid collisions
    const uniquePrefix = uuidv4().split('-')[0];
    cb(null, `${uniquePrefix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
});

// GET /api/backups - list user's backups
router.get('/', (req, res) => {
  try {
    const { device_id } = req.query;

    let query = `
      SELECT b.*, d.device_name, d.device_model, d.device_os
      FROM backups b
      LEFT JOIN devices d ON b.device_id = d.id
      WHERE b.user_id = ?
    `;
    const params = [req.user.id];

    if (device_id) {
      query += ' AND b.device_id = ?';
      params.push(device_id);
    }

    query += ' ORDER BY b.created_at DESC';

    const backups = db.prepare(query).all(...params);
    return res.json({ backups });
  } catch (err) {
    console.error('List backups error:', err);
    return res.status(500).json({ error: 'Error al obtener los backups.' });
  }
});

// POST /api/backups - create a new backup record
router.post('/', (req, res) => {
  try {
    const { name, device_id, destination_type, notes } = req.body;

    if (!name || !device_id || !destination_type) {
      return res.status(400).json({ error: 'Nombre, dispositivo y tipo de destino son requeridos.' });
    }

    const validDestinations = ['sd_card', 'usb', 'cloud', 'local'];
    if (!validDestinations.includes(destination_type)) {
      return res.status(400).json({ error: `Tipo de destino inválido. Opciones: ${validDestinations.join(', ')}` });
    }

    // Verify device belongs to user
    const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(device_id, req.user.id);
    if (!device) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    const backupId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO backups (id, user_id, device_id, name, backup_date, destination_type, status, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(backupId, req.user.id, device_id, name, now, destination_type, notes || null, now);

    const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
    return res.status(201).json({ backup, message: 'Backup creado exitosamente.' });
  } catch (err) {
    console.error('Create backup error:', err);
    return res.status(500).json({ error: 'Error al crear el backup.' });
  }
});

// GET /api/backups/:id - get backup details with file list
router.get('/:id', (req, res) => {
  try {
    const backup = db.prepare(`
      SELECT b.*, d.device_name, d.device_model, d.device_os
      FROM backups b
      LEFT JOIN devices d ON b.device_id = d.id
      WHERE b.id = ? AND b.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado.' });
    }

    const files = db.prepare(`
      SELECT * FROM backup_files WHERE backup_id = ? ORDER BY created_at ASC
    `).all(req.params.id);

    return res.json({ backup, files });
  } catch (err) {
    console.error('Get backup error:', err);
    return res.status(500).json({ error: 'Error al obtener el backup.' });
  }
});

// PATCH /api/backups/:id - update backup record
router.patch('/:id', (req, res) => {
  try {
    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado.' });
    }

    const { status, size_bytes, file_count, name, notes } = req.body;

    const validStatuses = ['pending', 'running', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${validStatuses.join(', ')}` });
    }

    const updates = {
      status: status !== undefined ? status : backup.status,
      size_bytes: size_bytes !== undefined ? size_bytes : backup.size_bytes,
      file_count: file_count !== undefined ? file_count : backup.file_count,
      name: name !== undefined ? name : backup.name,
      notes: notes !== undefined ? notes : backup.notes,
    };

    db.prepare(`
      UPDATE backups
      SET status = ?, size_bytes = ?, file_count = ?, name = ?, notes = ?
      WHERE id = ?
    `).run(updates.status, updates.size_bytes, updates.file_count, updates.name, updates.notes, req.params.id);

    const updated = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
    return res.json({ backup: updated, message: 'Backup actualizado.' });
  } catch (err) {
    console.error('Update backup error:', err);
    return res.status(500).json({ error: 'Error al actualizar el backup.' });
  }
});

// DELETE /api/backups/:id - delete backup and files
router.delete('/:id', (req, res) => {
  try {
    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado.' });
    }

    // Delete physical files from disk if they exist
    const backupDir = path.resolve(path.join(UPLOADS_PATH, req.params.id));
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }

    // DB cascade will remove backup_files entries
    db.prepare('DELETE FROM backups WHERE id = ?').run(req.params.id);

    return res.json({ message: 'Backup eliminado correctamente.' });
  } catch (err) {
    console.error('Delete backup error:', err);
    return res.status(500).json({ error: 'Error al eliminar el backup.' });
  }
});

// POST /api/backups/:id/files - upload a file for cloud backup
router.post('/:id/files', (req, res) => {
  // First verify backup ownership
  const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!backup) {
    return res.status(404).json({ error: 'Backup no encontrado.' });
  }

  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 500MB).' });
      }
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Error al subir el archivo.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    try {
      const fileId = uuidv4();
      const now = new Date().toISOString();
      const originalPath = req.body.original_path || null;
      const fileType = req.file.mimetype || 'application/octet-stream';
      const storagePath = path.join(req.params.id, req.file.filename);

      db.prepare(`
        INSERT INTO backup_files (id, backup_id, original_path, file_name, file_size, file_type, storage_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(fileId, req.params.id, originalPath, req.file.originalname, req.file.size, fileType, storagePath, now);

      // Update backup totals
      db.prepare(`
        UPDATE backups
        SET file_count = file_count + 1, size_bytes = size_bytes + ?
        WHERE id = ?
      `).run(req.file.size, req.params.id);

      const fileRecord = db.prepare('SELECT * FROM backup_files WHERE id = ?').get(fileId);
      return res.status(201).json({ file: fileRecord, message: 'Archivo subido exitosamente.' });
    } catch (dbErr) {
      console.error('DB insert file error:', dbErr);
      return res.status(500).json({ error: 'Error al registrar el archivo.' });
    }
  });
});

// GET /api/backups/:id/files/:fileId/download - download a specific file
router.get('/:id/files/:fileId/download', (req, res) => {
  try {
    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado.' });
    }

    const fileRecord = db.prepare(`
      SELECT * FROM backup_files WHERE id = ? AND backup_id = ?
    `).get(req.params.fileId, req.params.id);

    if (!fileRecord) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    const filePath = path.resolve(path.join(UPLOADS_PATH, fileRecord.storage_path));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'El archivo no existe en el servidor.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.file_name}"`);
    res.setHeader('Content-Type', fileRecord.file_type || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (err) {
    console.error('Download file error:', err);
    return res.status(500).json({ error: 'Error al descargar el archivo.' });
  }
});

module.exports = router;
