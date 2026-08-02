const express = require('express');
const multer = require('multer');
const db = require('../db/connection');
const { nextPatientCode, paginationParams, todayStr } = require('../utils/helpers');
const { parseFileToRows, mapRowToPatient, normalizeDob } = require('../utils/importParser');
const { requireRole } = require('../middleware/auth');
const { enrollPatientInSwarnaPrashana } = require('../services/swarnaPrashanaService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const staffOnly = requireRole('admin', 'front_desk'); // therapists can view patients but not edit them

// GET /api/patients?search=&status=&page=&limit=
router.get('/', (req, res) => {
  const { search = '', status } = req.query;
  const { limit, page, offset } = paginationParams(req.query);

  const conditions = [];
  const params = {};
  if (search) {
    conditions.push('(full_name LIKE @search OR phone LIKE @search OR patient_code LIKE @search)');
    params.search = `%${search}%`;
  }
  if (status) {
    conditions.push('status = @status');
    params.status = status;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM patients ${whereClause}`).get(params).c;
  const rows = db
    .prepare(`SELECT * FROM patients ${whereClause} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/patients/:id  (with vaccination / session / fee summaries)
router.get('/:id', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const vaccinations = db
    .prepare(
      `SELECT pv.*, v.name AS vaccine_name FROM patient_vaccinations pv
       JOIN vaccines v ON v.id = pv.vaccine_id WHERE pv.patient_id = ? ORDER BY pv.scheduled_date DESC`
    )
    .all(req.params.id);

  const sessions = db
    .prepare(
      `SELECT ts.*, r.room_name, t.full_name AS therapist_name FROM therapy_sessions ts
       JOIN rooms r ON r.id = ts.room_id JOIN therapists t ON t.id = ts.therapist_id
       WHERE ts.patient_id = ? ORDER BY ts.session_date DESC, ts.start_time DESC`
    )
    .all(req.params.id);

  const fees = db
    .prepare('SELECT * FROM fees WHERE patient_id = ? ORDER BY created_at DESC')
    .all(req.params.id);

  res.json({ ...patient, vaccinations, sessions, fees });
});

// POST /api/patients
router.post('/', staffOnly, (req, res) => {
  const {
    full_name, dob, gender, phone, whatsapp_number, email,
    address, guardian_name, guardian_phone, blood_group, medical_notes,
    enroll_swarna, swarna_start_date,
  } = req.body;

  if (!full_name || !phone) {
    return res.status(400).json({ error: 'full_name and phone are required.' });
  }

  const patient_code = nextPatientCode();
  const info = db
    .prepare(
      `INSERT INTO patients
        (patient_code, full_name, dob, gender, phone, whatsapp_number, email, address,
         guardian_name, guardian_phone, blood_group, medical_notes)
       VALUES (@patient_code, @full_name, @dob, @gender, @phone, @whatsapp_number, @email, @address,
               @guardian_name, @guardian_phone, @blood_group, @medical_notes)`
    )
    .run({
      patient_code,
      full_name,
      dob: dob || null,
      gender: gender || null,
      phone,
      whatsapp_number: whatsapp_number || null,
      email: email || null,
      address: address || null,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
      blood_group: blood_group || null,
      medical_notes: medical_notes || null,
    });

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);

  let swarna_enrollment = null;
  const wantsEnrollment = enroll_swarna === true || enroll_swarna === 'true' || enroll_swarna === 'on';
  if (wantsEnrollment) {
    swarna_enrollment = enrollPatientInSwarnaPrashana(patient.id, swarna_start_date || todayStr());
  }

  res.status(201).json({ ...patient, swarna_enrollment });
});

// POST /api/patients/import — bulk-create patients from an uploaded .xlsx, .xls, .csv, or .json file
router.post('/import', staffOnly, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Attach it under the "file" field.' });
  }

  let rawRows;
  try {
    rawRows = parseFileToRows(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: `Could not read that file: ${err.message}` });
  }

  if (!rawRows.length) {
    return res.status(400).json({ error: 'The file has no rows to import.' });
  }

  const insertStmt = db.prepare(
    `INSERT INTO patients
      (patient_code, full_name, dob, gender, phone, whatsapp_number, email, address,
       guardian_name, guardian_phone, blood_group, medical_notes)
     VALUES (@patient_code, @full_name, @dob, @gender, @phone, @whatsapp_number, @email, @address,
             @guardian_name, @guardian_phone, @blood_group, @medical_notes)`
  );
  const findByPhone = db.prepare("SELECT id FROM patients WHERE phone = ? AND status = 'active'");

  const results = { imported: 0, skipped: 0, errors: [] };

  const runImport = db.transaction(() => {
    rawRows.forEach((rawRow, index) => {
      const rowNum = index + 2; // account for the header row when reporting back
      const mapped = mapRowToPatient(rawRow);

      if (!mapped.full_name || !mapped.phone) {
        results.skipped++;
        results.errors.push({ row: rowNum, reason: 'Missing required name or phone.' });
        return;
      }
      if (findByPhone.get(mapped.phone)) {
        results.skipped++;
        results.errors.push({ row: rowNum, reason: `An active patient with phone ${mapped.phone} already exists.` });
        return;
      }

      const gender = ['male', 'female', 'other'].includes((mapped.gender || '').toLowerCase())
        ? mapped.gender.toLowerCase()
        : null;

      try {
        insertStmt.run({
          patient_code: nextPatientCode(),
          full_name: mapped.full_name,
          dob: normalizeDob(mapped.dob),
          gender,
          phone: mapped.phone,
          whatsapp_number: mapped.whatsapp_number || null,
          email: mapped.email || null,
          address: mapped.address || null,
          guardian_name: mapped.guardian_name || null,
          guardian_phone: mapped.guardian_phone || null,
          blood_group: mapped.blood_group || null,
          medical_notes: mapped.medical_notes || null,
        });
        results.imported++;
      } catch (err) {
        results.skipped++;
        results.errors.push({ row: rowNum, reason: err.message });
      }
    });
  });

  runImport();
  res.json(results);
});

// PUT /api/patients/:id
router.put('/:id', staffOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found.' });

  const fields = [
    'full_name', 'dob', 'gender', 'phone', 'whatsapp_number', 'email', 'address',
    'guardian_name', 'guardian_phone', 'blood_group', 'medical_notes', 'status',
  ];
  const updates = {};
  for (const f of fields) {
    updates[f] = req.body[f] !== undefined ? req.body[f] : existing[f];
  }

  db.prepare(
    `UPDATE patients SET
      full_name=@full_name, dob=@dob, gender=@gender, phone=@phone, whatsapp_number=@whatsapp_number,
      email=@email, address=@address, guardian_name=@guardian_name, guardian_phone=@guardian_phone,
      blood_group=@blood_group, medical_notes=@medical_notes, status=@status, updated_at=datetime('now')
     WHERE id=@id`
  ).run({ ...updates, id: req.params.id });

  res.json(db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id));
});

// DELETE /api/patients/:id  (soft delete)
router.delete('/:id', staffOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found.' });
  db.prepare("UPDATE patients SET status = 'inactive', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
