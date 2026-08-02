const express = require('express');
const db = require('../db/connection');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — any signed-in user (needed to render the letterhead on generated documents)
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM clinic_settings WHERE id = 1').get());
});

// PUT /api/settings — admin only
router.put('/', requireRole('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM clinic_settings WHERE id = 1').get();
  const { clinic_name, address, phone, email, registration_number } = req.body;
  if (!clinic_name || !clinic_name.trim()) {
    return res.status(400).json({ error: 'clinic_name is required.' });
  }
  db.prepare(
    `UPDATE clinic_settings
     SET clinic_name=?, address=?, phone=?, email=?, registration_number=?, updated_at=datetime('now')
     WHERE id=1`
  ).run(
    clinic_name,
    address ?? existing.address,
    phone ?? existing.phone,
    email ?? existing.email,
    registration_number ?? existing.registration_number
  );
  res.json(db.prepare('SELECT * FROM clinic_settings WHERE id = 1').get());
});

module.exports = router;
