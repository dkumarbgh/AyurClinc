const express = require('express');
const db = require('../db/connection');
const whatsapp = require('../services/whatsappService');
const { addMonths, todayStr } = require('../utils/helpers');
const { enrollPatientInSwarnaPrashana } = require('../services/swarnaPrashanaService');

const router = express.Router();

/** Create the next month's dose record for an enrollment, unless one already exists. */
function ensureNextDose(enrollmentId, patientId, afterDoseNumber, afterScheduledDate) {
  const enrollment = db.prepare('SELECT * FROM swarna_prashana_enrollments WHERE id = ?').get(enrollmentId);
  if (!enrollment || enrollment.status !== 'active') return null;

  const nextDoseNumber = afterDoseNumber + 1;
  const existing = db
    .prepare('SELECT * FROM swarna_prashana_doses WHERE enrollment_id = ? AND dose_number = ?')
    .get(enrollmentId, nextDoseNumber);
  if (existing) return existing;

  const nextScheduled = addMonths(afterScheduledDate, 1);
  const info = db
    .prepare(
      `INSERT INTO swarna_prashana_doses (enrollment_id, patient_id, dose_number, scheduled_date)
       VALUES (?, ?, ?, ?)`
    )
    .run(enrollmentId, patientId, nextDoseNumber, nextScheduled);
  return db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(info.lastInsertRowid);
}

// ---------------- Enrollments ----------------

// GET /api/swarna-prashana/enrollments?status=active
router.get('/enrollments', (req, res) => {
  const { status } = req.query;
  const conditions = [];
  const params = {};
  if (status) { conditions.push('e.status = @status'); params.status = status; }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT e.*, p.full_name, p.patient_code, p.phone, p.whatsapp_number,
        (SELECT COUNT(*) FROM swarna_prashana_doses d WHERE d.enrollment_id = e.id) AS dose_count,
        (SELECT MAX(dose_number) FROM swarna_prashana_doses d WHERE d.enrollment_id = e.id AND d.dose_status = 'administered') AS doses_completed
       FROM swarna_prashana_enrollments e
       JOIN patients p ON p.id = e.patient_id
       ${whereClause}
       ORDER BY e.created_at DESC`
    )
    .all(params);
  res.json(rows);
});

// POST /api/swarna-prashana/enrollments — enroll a patient and create dose #1
router.post('/enrollments', (req, res) => {
  const { patient_id, start_date, notes } = req.body;
  if (!patient_id || !start_date) {
    return res.status(400).json({ error: 'patient_id and start_date are required.' });
  }

  const already = db
    .prepare("SELECT id FROM swarna_prashana_enrollments WHERE patient_id = ? AND status = 'active'")
    .get(patient_id);
  if (already) {
    return res.status(409).json({ error: 'This patient already has an active Swarna Prashana enrollment.' });
  }

  const enrollment = db.transaction(() => enrollPatientInSwarnaPrashana(patient_id, start_date, notes))();
  res.status(201).json(enrollment);
});

// PUT /api/swarna-prashana/enrollments/:id — pause/stop/resume
router.put('/enrollments/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM swarna_prashana_enrollments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Enrollment not found.' });
  const { status, notes } = req.body;
  db.prepare('UPDATE swarna_prashana_enrollments SET status=?, notes=? WHERE id=?').run(
    status ?? existing.status,
    notes ?? existing.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM swarna_prashana_enrollments WHERE id = ?').get(req.params.id));
});

// ---------------- Dose / call queues ----------------

// GET /api/swarna-prashana/doses?call_status=&days=
// Shows every dose scheduled on or before `days` from now (default 31) — this
// intentionally includes overdue ones, since those are exactly the calls
// still waiting to be made.
router.get('/doses', (req, res) => {
  const { call_status } = req.query;
  const days = parseInt(req.query.days, 10) || 31;
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  const untilStr = until.toISOString().slice(0, 10);

  const conditions = ['d.scheduled_date <= @until'];
  const params = { until: untilStr };
  if (call_status) { conditions.push('d.call_status = @call_status'); params.call_status = call_status; }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = db
    .prepare(
      `SELECT d.*, p.full_name, p.patient_code, p.phone, p.whatsapp_number, p.guardian_name, p.guardian_phone
       FROM swarna_prashana_doses d
       JOIN patients p ON p.id = d.patient_id
       ${whereClause}
       ORDER BY d.scheduled_date ASC`
    )
    .all(params);
  res.json(rows);
});

// GET /api/swarna-prashana/doses/monthly?month=YYYY-MM — everything due in one calendar month, plus counts
router.get('/doses/monthly', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : todayStr().slice(0, 7);
  const from = `${month}-01`;
  const to = `${month}-31`; // scheduled_date is a plain YYYY-MM-DD string; lexicographic compare works fine here

  const doses = db
    .prepare(
      `SELECT d.*, p.full_name, p.patient_code, p.phone, p.whatsapp_number, p.guardian_name, p.guardian_phone
       FROM swarna_prashana_doses d
       JOIN patients p ON p.id = d.patient_id
       WHERE d.scheduled_date BETWEEN ? AND ?
       ORDER BY d.scheduled_date ASC`
    )
    .all(from, to);

  const summary = {
    total: doses.length,
    callStatus: { not_called: 0, called: 0, no_answer: 0, rejected: 0 },
    doseStatus: { pending: 0, administered: 0, missed: 0, cancelled: 0 },
  };
  for (const d of doses) {
    summary.callStatus[d.call_status] = (summary.callStatus[d.call_status] || 0) + 1;
    summary.doseStatus[d.dose_status] = (summary.doseStatus[d.dose_status] || 0) + 1;
  }

  res.json({ month, doses, summary });
});

// GET /api/swarna-prashana/patients/:patientId/doses — full history for one patient
router.get('/patients/:patientId/doses', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM swarna_prashana_doses WHERE patient_id = ? ORDER BY scheduled_date DESC`
    )
    .all(req.params.patientId);
  res.json(rows);
});

// PUT /api/swarna-prashana/doses/:id/call — record the outcome of the parent phone call
router.put('/doses/:id/call', async (req, res) => {
  const dose = db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id);
  if (!dose) return res.status(404).json({ error: 'Dose record not found.' });

  const { call_status, call_notes, called_by } = req.body;
  if (!['called', 'no_answer', 'rejected'].includes(call_status)) {
    return res.status(400).json({ error: 'call_status must be one of: called, no_answer, rejected.' });
  }

  db.prepare(
    `UPDATE swarna_prashana_doses
     SET call_status = ?, call_notes = ?, called_by = ?, called_at = datetime('now')
     WHERE id = ?`
  ).run(call_status, call_notes || null, called_by || null, req.params.id);

  // If a call went unanswered, follow up with a WhatsApp nudge (uses the same stub/live service as everything else).
  if (call_status === 'no_answer') {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(dose.patient_id);
    if (patient) {
      await whatsapp.sendMessage({
        to: patient.whatsapp_number || patient.phone,
        message:
          `Hi, we tried calling about ${patient.full_name}'s Swarna Prashana dose scheduled for ` +
          `${dose.scheduled_date}. Please call the clinic back or visit us to continue this month's dose.`,
        type: 'swarna_prashana_reminder',
        patientId: patient.id,
      });
    }
  }

  res.json(db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id));
});

// PUT /api/swarna-prashana/doses/:id/administer — mark the dose given, auto-schedule next month
router.put('/doses/:id/administer', (req, res) => {
  const dose = db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id);
  if (!dose) return res.status(404).json({ error: 'Dose record not found.' });

  const { administered_date, administered_by, notes } = req.body;
  const adminDate = administered_date || todayStr();

  db.prepare(
    `UPDATE swarna_prashana_doses
     SET dose_status = 'administered', administered_date = ?, administered_by = ?, notes = ?
     WHERE id = ?`
  ).run(adminDate, administered_by || null, notes || null, req.params.id);

  const nextDose = ensureNextDose(dose.enrollment_id, dose.patient_id, dose.dose_number, adminDate);

  res.json({ updated: db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id), nextDose });
});

// PUT /api/swarna-prashana/doses/:id — mark missed/cancelled (still queues next month's dose)
router.put('/doses/:id', (req, res) => {
  const dose = db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id);
  if (!dose) return res.status(404).json({ error: 'Dose record not found.' });

  const { dose_status, notes } = req.body;
  db.prepare('UPDATE swarna_prashana_doses SET dose_status=?, notes=? WHERE id=?').run(
    dose_status ?? dose.dose_status,
    notes ?? dose.notes,
    req.params.id
  );

  let nextDose = null;
  if (['missed', 'cancelled'].includes(dose_status) && dose.dose_status === 'pending') {
    nextDose = ensureNextDose(dose.enrollment_id, dose.patient_id, dose.dose_number, dose.scheduled_date);
  }

  res.json({ updated: db.prepare('SELECT * FROM swarna_prashana_doses WHERE id = ?').get(req.params.id), nextDose });
});

module.exports = router;
