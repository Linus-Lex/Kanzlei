const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Login Fehler:', err);
    res.status(500).json({ error: 'Serverfehler beim Login.' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/users – nur Admin
router.post('/users', auth, requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
      [email.toLowerCase().trim(), hash, name, role || 'sachbearbeiter']
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'E-Mail bereits vergeben.' });
    }
    console.error('Benutzer erstellen Fehler:', err);
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

// GET /api/auth/users – nur Admin
router.get('/users', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

// PUT /api/auth/users/:id – nur Admin
router.put('/users/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { name, role, is_active, password } = req.body;
    const updates = [];
    const values = [];
    let i = 1;

    if (name) { updates.push(`name = $${i++}`); values.push(name); }
    if (role) { updates.push(`role = $${i++}`); values.push(role); }
    if (typeof is_active === 'boolean') { updates.push(`is_active = $${i++}`); values.push(is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${i++}`);
      values.push(hash);
    }

    if (!updates.length) return res.status(400).json({ error: 'Keine Änderungen.' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    );

    res.json({ message: 'Benutzer aktualisiert.' });
  } catch (err) {
    res.status(500).json({ error: 'Serverfehler.' });
  }
});

module.exports = router;
