const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const auth = async (req, res, next) => {
  try {
    // Token aus Header ODER Query-Parameter (für Download-Links)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Nicht autorisiert – kein Token.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, email, name, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Benutzer nicht gefunden oder deaktiviert.' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Ungültiger Token.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Nur Administratoren haben Zugriff.' });
  }
  next();
};

module.exports = { auth, requireAdmin };
