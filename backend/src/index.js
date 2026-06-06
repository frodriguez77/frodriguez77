require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const backupRoutes = require('./routes/backups');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_PATH = process.env.UPLOADS_PATH || './uploads';

// Ensure uploads directory exists
const uploadsDir = path.resolve(UPLOADS_PATH);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// CORS: allow all origins for development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// JSON body parser with 50mb limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'SafeBackup API', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/backups', authMiddleware, backupRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor.', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

initDb();

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║        SafeBackup API Server         ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`  Running on: http://localhost:${PORT}`);
  console.log(`  Uploads at: ${uploadsDir}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;
