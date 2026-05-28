const pool = require('../config/db');

const auditLog = async ({ caseId, userId, action, oldValues, newValues, ipAddress }) => {
  try {
    // Mandantendaten NIE in Logs schreiben – nur Feldnamen
    const sanitize = (obj) => {
      if (!obj) return null;
      const safe = {};
      Object.keys(obj).forEach(k => { safe[k] = '[geändert]'; });
      return safe;
    };

    await pool.query(
      `INSERT INTO audit_log (case_id, user_id, action, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [caseId, userId, action, JSON.stringify(sanitize(oldValues)), JSON.stringify(sanitize(newValues)), ipAddress]
    );
  } catch (err) {
    console.error('Audit-Log Fehler:', err.message);
  }
};

module.exports = { auditLog };
