const express = require('express');
const db = require('../db/connection');
const { addMonths, todayStr } = require('../utils/helpers');

const router = express.Router();

// ---------------- Vaccine master list ----------------

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM vaccines ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, description, recurring_interval_months, total_doses } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const info = db
    .prepare(
      'INSERT INTO vaccines (name, description, recurring_interval_months, total_doses) VALUES (?, ?, ?, ?)'
    )
    .run(name, description || null, recurring_interval_months || null, total_doses || null);
  res.status(201).json(db.prepare('SELECT * FROM vaccines WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vaccines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vaccine not found.' });
  const { name, description, recurring_interval_months, total_doses, active } = req.body;
  db.prepare(
    `UPDATE vaccines SET name=?, description=?, recurring_interval_months=?, total_doses=?, active=?
     WHERE id=?`
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    recurring_interval_months ?? existing.recurring_interval_months,
    total_doses ?? existing.total_doses,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM vaccines WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vaccines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vaccine not found.' });
  db.prepare('UPDATE vaccines SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------------- Due / overdue vaccination queues (dashboard) ----------------
// NOTE: defined before "/:patientId..." style routes are mounted elsewhere (separate router),
// so no path collisions here.

router.get('/due/upcoming', (req, res) => {
  const days = parseInt(req.query.days, 10) || 7;
  const today = todayStr();
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  const untilStr = until.toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT pv.*, p.full_name, p.phone, v.name AS vaccine_name
       FROM patient_vaccinations pv
       JOIN patients p ON p.id = pv.patient_id
       JOIN vaccines v ON v.id = pv.vaccine_id
       WHERE pv.status = 'pending' AND pv.scheduled_date BETWEEN ? AND ?
       ORDER BY pv.scheduled_date ASC`
    )
    .all(today, untilStr);
  res.json(rows);
});

router.get('/due/overdue', (req, res) => {
  const today = todayStr();
  const rows = db
    .prepare(
      `SELECT pv.*, p.full_name, p.phone, v.name AS vaccine_name
       FROM patient_vaccinations pv
       JOIN patients p ON p.id = pv.patient_id
       JOIN vaccines v ON v.id = pv.vaccine_id
       WHERE pv.status = 'pending' AND pv.scheduled_date < ?
       ORDER BY pv.scheduled_date ASC`
    )
    .all(today);
  res.json(rows);
});

// ---------------- Patient vaccination records ----------------

// Schedule a new vaccination dose for a patient
router.post('/schedule', (req, res) => {
  const { patient_id, vaccine_id, scheduled_date, dose_number } = req.body;
  if (!patient_id || !vaccine_id || !scheduled_date) {
    return res.status(400).json({ error: 'patient_id, vaccine_id, and scheduled_date are required.' });
  }
  const info = db
    .prepare(
      `INSERT INTO patient_vaccinations (patient_id, vaccine_id, dose_number, scheduled_date)
       VALUES (?, ?, ?, ?)`
    )
    .run(patient_id, vaccine_id, dose_number || 1, scheduled_date);
  res.status(201).json(db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(info.lastInsertRowid));
});

// Mark a dose administered — auto-schedules the next dose if the vaccine recurs (e.g. monthly)
router.put('/record/:id/administer', (req, res) => {
  const record = db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Vaccination record not found.' });

  const { administered_date, administered_by, notes } = req.body;
  const adminDate = administered_date || todayStr();

  db.prepare(
    `UPDATE patient_vaccinations
     SET status = 'administered', administered_date = ?, administered_by = ?, notes = ?
     WHERE id = ?`
  ).run(adminDate, administered_by || null, notes || null, req.params.id);

  const vaccine = db.prepare('SELECT * FROM vaccines WHERE id = ?').get(record.vaccine_id);

  let nextDose = null;
  const doseLimitReached = vaccine.total_doses && record.dose_number >= vaccine.total_doses;
  if (vaccine.recurring_interval_months && !doseLimitReached) {
    const nextScheduled = addMonths(adminDate, vaccine.recurring_interval_months);
    const info = db
      .prepare(
        `INSERT INTO patient_vaccinations (patient_id, vaccine_id, dose_number, scheduled_date)
         VALUES (?, ?, ?, ?)`
      )
      .run(record.patient_id, record.vaccine_id, record.dose_number + 1, nextScheduled);
    nextDose = db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(info.lastInsertRowid);
  }

  res.json({ updated: db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(req.params.id), nextDose });
});

// Update status (e.g. mark missed/cancelled) or reschedule date
router.put('/record/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Vaccination record not found.' });
  const { scheduled_date, status, notes } = req.body;
  db.prepare(
    `UPDATE patient_vaccinations SET scheduled_date=?, status=?, notes=? WHERE id=?`
  ).run(
    scheduled_date ?? record.scheduled_date,
    status ?? record.status,
    notes ?? record.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM patient_vaccinations WHERE id = ?').get(req.params.id));
});

module.exports = router;
