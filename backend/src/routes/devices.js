const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// GET /api/devices - list user's devices
router.get('/', (req, res) => {
  try {
    const devices = db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM backups b WHERE b.device_id = d.id) as backup_count,
        (SELECT MAX(b.backup_date) FROM backups b WHERE b.device_id = d.id) as last_backup_date
      FROM devices d
      WHERE d.user_id = ?
      ORDER BY d.created_at DESC
    `).all(req.user.id);

    return res.json({ devices });
  } catch (err) {
    console.error('List devices error:', err);
    return res.status(500).json({ error: 'Error al obtener los dispositivos.' });
  }
});

// POST /api/devices - register a new device
router.post('/', (req, res) => {
  try {
    const { device_name, device_model, device_os } = req.body;

    if (!device_name) {
      return res.status(400).json({ error: 'El nombre del dispositivo es requerido.' });
    }

    // Check if a device with same name already exists for this user
    const existing = db.prepare(`
      SELECT id FROM devices WHERE user_id = ? AND device_name = ?
    `).get(req.user.id, device_name);

    if (existing) {
      // Return existing device instead of creating duplicate
      const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(existing.id);
      return res.json({ device, message: 'Dispositivo ya registrado.' });
    }

    const deviceId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO devices (id, user_id, device_name, device_model, device_os, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(deviceId, req.user.id, device_name, device_model || null, device_os || null, now);

    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);

    return res.status(201).json({ device, message: 'Dispositivo registrado exitosamente.' });
  } catch (err) {
    console.error('Create device error:', err);
    return res.status(500).json({ error: 'Error al registrar el dispositivo.' });
  }
});

// DELETE /api/devices/:id - delete a device and its backups
router.delete('/:id', (req, res) => {
  try {
    const device = db.prepare(`
      SELECT * FROM devices WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!device) {
      return res.status(404).json({ error: 'Dispositivo no encontrado.' });
    }

    // Cascade delete will remove associated backups and backup_files
    db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);

    return res.json({ message: 'Dispositivo eliminado correctamente.' });
  } catch (err) {
    console.error('Delete device error:', err);
    return res.status(500).json({ error: 'Error al eliminar el dispositivo.' });
  }
});

module.exports = router;
