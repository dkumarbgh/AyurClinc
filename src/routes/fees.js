const express = require('express');
const db = require('../db/connection');
const whatsapp = require('../services/whatsappService');
const { paginationParams, todayStr } = require('../utils/helpers');

const router = express.Router();

// GET /api/fees?status=&patient_id=&page=&limit=
router.get('/', (req, res) => {
  const { status, patient_id } = req.query;
  const { limit, page, offset } = paginationParams(req.query);
  const conditions = [];
  const params = {};
  if (status) { conditions.push('f.payment_status = @status'); params.status = status; }
  if (patient_id) { conditions.push('f.patient_id = @patient_id'); params.patient_id = patient_id; }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM fees f ${whereClause}`).get(params).c;
  const rows = db
    .prepare(
      `SELECT f.*, p.full_name AS patient_name, p.patient_code
       FROM fees f JOIN patients p ON p.id = f.patient_id
       ${whereClause} ORDER BY f.created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/fees/summary — dashboard totals
router.get('/summary', (req, res) => {
  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_paid ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN payment_status IN ('pending','partial') THEN amount - amount_paid ELSE 0 END), 0) AS total_pending,
        COUNT(CASE WHEN payment_status IN ('pending','partial') THEN 1 END) AS pending_invoices
       FROM fees`
    )
    .get();
  res.json(totals);
});

// POST /api/fees — create a new fee/invoice entry
router.post('/', (req, res) => {
  const { patient_id, session_id, vaccination_id, purpose, amount, due_date, notes } = req.body;
  if (!patient_id || amount === undefined) {
    return res.status(400).json({ error: 'patient_id and amount are required.' });
  }
  const info = db
    .prepare(
      `INSERT INTO fees (patient_id, session_id, vaccination_id, purpose, amount, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(patient_id, session_id || null, vaccination_id || null, purpose || 'other', amount, due_date || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM fees WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/fees/:id/pay — record a payment (full or partial)
router.put('/:id/pay', async (req, res) => {
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Fee record not found.' });

  const { amount_paid, payment_method } = req.body;
  if (amount_paid === undefined || amount_paid <= 0) {
    return res.status(400).json({ error: 'amount_paid must be a positive number.' });
  }

  const newAmountPaid = fee.amount_paid + Number(amount_paid);
  const newStatus = newAmountPaid >= fee.amount ? 'paid' : 'partial';
  const paidDate = newStatus === 'paid' ? todayStr() : fee.paid_date;

  db.prepare(
    `UPDATE fees SET amount_paid=?, payment_method=?, payment_status=?, paid_date=? WHERE id=?`
  ).run(newAmountPaid, payment_method || fee.payment_method, newStatus, paidDate, req.params.id);

  const updated = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);

  if (newStatus === 'paid') {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(fee.patient_id);
    if (patient) {
      await whatsapp.sendMessage({
        to: patient.whatsapp_number || patient.phone,
        message: `Hi ${patient.full_name}, we've received your payment of Rs.${Number(amount_paid).toFixed(2)}. Thank you!`,
        type: 'payment_confirmation',
        patientId: patient.id,
      });
    }
  }

  res.json(updated);
});

// PUT /api/fees/:id — edit an invoice (amount/purpose/due date/notes)
router.put('/:id', (req, res) => {
  const fee = db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id);
  if (!fee) return res.status(404).json({ error: 'Fee record not found.' });
  const { purpose, amount, due_date, notes } = req.body;
  db.prepare('UPDATE fees SET purpose=?, amount=?, due_date=?, notes=? WHERE id=?').run(
    purpose ?? fee.purpose,
    amount ?? fee.amount,
    due_date ?? fee.due_date,
    notes ?? fee.notes,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM fees WHERE id = ?').get(req.params.id));
});

module.exports = router;
