const express = require('express');
const db = require('../db/connection');

const router = express.Router();

function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/** Returns a conflict description if the room or therapist is already booked, else null. */
function findConflict({ room_id, therapist_id, session_date, start_time, end_time, excludeId }) {
  const existing = db
    .prepare(
      `SELECT * FROM therapy_sessions
       WHERE session_date = ? AND status = 'scheduled' AND (room_id = ? OR therapist_id = ?)
       ${excludeId ? 'AND id != ?' : ''}`
    )
    .all(...(excludeId
      ? [session_date, room_id, therapist_id, excludeId]
      : [session_date, room_id, therapist_id]));

  for (const s of existing) {
    if (timesOverlap(start_time, end_time, s.start_time, s.end_time)) {
      if (s.room_id === room_id) return `Room is already booked from ${s.start_time} to ${s.end_time}.`;
      if (s.therapist_id === therapist_id) return `Therapist is already booked from ${s.start_time} to ${s.end_time}.`;
    }
  }
  return null;
}

// GET /api/appointments?date=&room_id=&therapist_id=&patient_id=
router.get('/', (req, res) => {
  const { date, room_id, therapist_id, patient_id } = req.query;
  const conditions = [];
  const params = {};
  if (date) { conditions.push('ts.session_date = @date'); params.date = date; }
  if (room_id) { conditions.push('ts.room_id = @room_id'); params.room_id = room_id; }
  if (therapist_id) { conditions.push('ts.therapist_id = @therapist_id'); params.therapist_id = therapist_id; }
  if (patient_id) { conditions.push('ts.patient_id = @patient_id'); params.patient_id = patient_id; }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT ts.*, p.full_name AS patient_name, r.room_name, t.full_name AS therapist_name
       FROM therapy_sessions ts
       JOIN patients p ON p.id = ts.patient_id
       JOIN rooms r ON r.id = ts.room_id
       JOIN therapists t ON t.id = ts.therapist_id
       ${whereClause}
       ORDER BY ts.session_date, ts.start_time`
    )
    .all(params);
  res.json(rows);
});

// POST /api/appointments — book a session, checking room + therapist availability
router.post('/', (req, res) => {
  const { patient_id, therapist_id, room_id, session_date, start_time, end_time, notes } = req.body;
  if (!patient_id || !therapist_id || !room_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({
      error: 'patient_id, therapist_id, room_id, session_date, start_time, and end_time are required.',
    });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ error: 'start_time must be before end_time.' });
  }

  const conflict = findConflict({ room_id, therapist_id, session_date, start_time, end_time });
  if (conflict) return res.status(409).json({ error: conflict });

  const info = db
    .prepare(
      `INSERT INTO therapy_sessions (patient_id, therapist_id, room_id, session_date, start_time, end_time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(patient_id, therapist_id, room_id, session_date, start_time, end_time, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM therapy_sessions WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/appointments/:id — reschedule or change status
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM therapy_sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Appointment not found.' });

  const {
    therapist_id = existing.therapist_id,
    room_id = existing.room_id,
    session_date = existing.session_date,
    start_time = existing.start_time,
    end_time = existing.end_time,
    status = existing.status,
    notes = existing.notes,
  } = req.body;

  if (status === 'scheduled') {
    const conflict = findConflict({
      room_id, therapist_id, session_date, start_time, end_time, excludeId: req.params.id,
    });
    if (conflict) return res.status(409).json({ error: conflict });
  }

  db.prepare(
    `UPDATE therapy_sessions SET therapist_id=?, room_id=?, session_date=?, start_time=?, end_time=?, status=?, notes=?
     WHERE id=?`
  ).run(therapist_id, room_id, session_date, start_time, end_time, status, notes, req.params.id);

  res.json(db.prepare('SELECT * FROM therapy_sessions WHERE id = ?').get(req.params.id));
});

// DELETE /api/appointments/:id — cancel
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM therapy_sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Appointment not found.' });
  db.prepare("UPDATE therapy_sessions SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
