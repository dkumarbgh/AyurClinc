const express = require('express');
const db = require('../db/connection');
const whatsapp = require('../services/whatsappService');
const { paginationParams } = require('../utils/helpers');
const { runVaccineReminders, runAppointmentReminders, runFeeReminders } = require('../services/reminderJobs');

const router = express.Router();

router.get('/logs', (req, res) => {
  const { limit, page, offset } = paginationParams(req.query, 50, 200);
  const total = db.prepare('SELECT COUNT(*) AS c FROM whatsapp_logs').get().c;
  const rows = db
    .prepare(
      `SELECT wl.*, p.full_name AS patient_name FROM whatsapp_logs wl
       LEFT JOIN patients p ON p.id = wl.patient_id
       ORDER BY wl.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

// Manually trigger a message (useful for testing the integration)
router.post('/test-send', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to and message are required.' });
  const result = await whatsapp.sendMessage({ to, message, type: 'general' });
  res.json({ provider: whatsapp.PROVIDER, ...result });
});

// Manually trigger the reminder jobs on demand (in addition to the daily cron schedule)
router.post('/run-reminders', async (req, res) => {
  const vaccineCount = await runVaccineReminders();
  const appointmentCount = await runAppointmentReminders();
  const feeCount = await runFeeReminders();
  res.json({ vaccineCount, appointmentCount, feeCount });
});

module.exports = router;
