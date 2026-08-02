const express = require('express');
const db = require('../db/connection');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');

router.get('/', (req, res) => {
  const { active } = req.query;
  let rows;
  if (active !== undefined) {
    rows = db.prepare('SELECT * FROM therapists WHERE active = ? ORDER BY full_name').all(active === 'true' ? 1 : 0);
  } else {
    rows = db.prepare('SELECT * FROM therapists ORDER BY full_name').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const therapist = db.prepare('SELECT * FROM therapists WHERE id = ?').get(req.params.id);
  if (!therapist) return res.status(404).json({ error: 'Therapist not found.' });
  res.json(therapist);
});

router.post('/', adminOnly, (req, res) => {
  const { full_name, specialization, phone, email, working_days } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });
  const info = db
    .prepare(
      `INSERT INTO therapists (full_name, specialization, phone, email, working_days)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      full_name,
      specialization || null,
      phone || null,
      email || null,
      working_days ? JSON.stringify(working_days) : JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    );
  res.status(201).json(db.prepare('SELECT * FROM therapists WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM therapists WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Therapist not found.' });
  const { full_name, specialization, phone, email, working_days, active } = req.body;
  db.prepare(
    `UPDATE therapists SET full_name=?, specialization=?, phone=?, email=?, working_days=?, active=? WHERE id=?`
  ).run(
    full_name ?? existing.full_name,
    specialization ?? existing.specialization,
    phone ?? existing.phone,
    email ?? existing.email,
    working_days ? JSON.stringify(working_days) : existing.working_days,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM therapists WHERE id = ?').get(req.params.id));
});

router.delete('/:id', adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM therapists WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Therapist not found.' });
  db.prepare('UPDATE therapists SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
