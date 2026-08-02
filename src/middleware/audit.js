const db = require('../db/connection');

const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'new_password', 'token']);

/** Strips sensitive fields and trims the payload before it goes into the audit trail. */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;
  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    clean[key] = SENSITIVE_KEYS.has(key) ? '[hidden]' : value;
  }
  const str = JSON.stringify(clean);
  return str.length > 500 ? str.slice(0, 500) + '…' : str;
}

/**
 * Records a lightweight "who did what when" entry for every authenticated,
 * non-GET request that succeeds. Mount this after requireAuth on any route
 * group worth tracking. This is intentionally generic (method + path,
 * rather than hand-written descriptions per route) so new endpoints get
 * audit coverage automatically without extra wiring.
 */
function auditLog(req, res, next) {
  if (req.method === 'GET') return next();

  res.on('finish', () => {
    if (!req.user || res.statusCode >= 400) return;
    try {
      db.prepare(
        `INSERT INTO audit_logs (user_id, username, method, path, status_code, details)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(req.user.id, req.user.username, req.method, req.originalUrl, res.statusCode, sanitizeBody(req.body));
    } catch (err) {
      console.error('Failed to write audit log:', err.message);
    }
  });

  next();
}

module.exports = auditLog;
