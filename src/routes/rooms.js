const express = require('express');
const db = require('../db/connection');
const { todayStr } = require('../utils/helpers');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = requireRole('admin');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY room_number').all());
});

// Room occupancy/schedule for a given date (defaults to today)
router.get('/occupancy', (req, res) => {
  const date = req.query.date || todayStr();
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number').all();
  const sessions = db
    .prepare(
      `SELECT ts.*, p.full_name AS patient_name, t.full_name AS therapist_name
       FROM therapy_sessions ts
       JOIN patients p ON p.id = ts.patient_id
       JOIN therapists t ON t.id = ts.therapist_id
       WHERE ts.session_date = ? AND ts.status = 'scheduled'
       ORDER BY ts.start_time`
    )
    .all(date);

  const result = rooms.map((room) => ({
    ...room,
    sessions: sessions.filter((s) => s.room_id === room.id),
  }));
  res.json({ date, rooms: result });
});

router.put('/:id', adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Room not found.' });
  const { room_name, capacity, active } = req.body;
  db.prepare('UPDATE rooms SET room_name=?, capacity=?, active=? WHERE id=?').run(
    room_name ?? existing.room_name,
    capacity ?? existing.capacity,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
});

module.exports = router;
