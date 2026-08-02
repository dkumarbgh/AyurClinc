const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, username: u.username, full_name: u.full_name, role: u.role, active: !!u.active, created_at: u.created_at };
}

// GET /api/users — list all staff accounts
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM admin_users ORDER BY created_at ASC').all();
  res.json(rows.map(publicUser));
});

// POST /api/users — create a new staff account
router.post('/', (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name, and role are required.' });
  }
  if (!['admin', 'front_desk', 'therapist'].includes(role)) {
    return res.status(400).json({ error: 'role must be one of: admin, front_desk, therapist.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO admin_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, full_name, role);
  res.status(201).json(publicUser(db.prepare('SELECT * FROM admin_users WHERE id = ?').get(info.lastInsertRowid)));
});

// PUT /api/users/:id — update role / active status / full name
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const { full_name, role, active } = req.body;
  if (role && !['admin', 'front_desk', 'therapist'].includes(role)) {
    return res.status(400).json({ error: 'role must be one of: admin, front_desk, therapist.' });
  }

  const targetingSelf = String(req.user.id) === String(req.params.id);
  const demotingSelf = targetingSelf && role && role !== 'admin';
  const deactivatingSelf = targetingSelf && active === false;
  if (demotingSelf || deactivatingSelf) {
    return res.status(400).json({ error: 'You cannot change your own role or deactivate your own account.' });
  }

  if ((role === 'front_desk' || role === 'therapist' || active === false) && existing.role === 'admin') {
    const activeAdmins = db
      .prepare("SELECT COUNT(*) AS c FROM admin_users WHERE role = 'admin' AND active = 1")
      .get().c;
    if (activeAdmins <= 1) {
      return res.status(400).json({ error: 'At least one active admin account must remain.' });
    }
  }

  db.prepare('UPDATE admin_users SET full_name=?, role=?, active=? WHERE id=?').run(
    full_name ?? existing.full_name,
    role ?? existing.role,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(publicUser(db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id)));
});

// PUT /api/users/:id/reset-password — admin sets a new password for someone else
router.put('/:id/reset-password', (req, res) => {
  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'new_password must be at least 6 characters.' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

module.exports = router;
