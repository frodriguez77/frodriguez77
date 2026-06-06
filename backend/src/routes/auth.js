const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const JWT_EXPIRES_IN = '30d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // Validation
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, nombre y contraseña son requeridos.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'El email ingresado no es válido.' });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    // Check if email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email.toLowerCase(), name.trim(), passwordHash, now);

    const user = { id: userId, email: email.toLowerCase(), name: name.trim() };
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Cuenta creada exitosamente.',
      token,
      user,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!userRow) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }

    const passwordMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
    }

    const user = { id: userRow.id, email: userRow.email, name: userRow.name };
    const token = generateToken(user);

    return res.json({
      message: 'Sesión iniciada correctamente.',
      token,
      user,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// GET /api/auth/me (protected)
router.get('/me', authMiddleware, (req, res) => {
  try {
    const userRow = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!userRow) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.json({ user: userRow });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

module.exports = router;
