const express = require('express');
const db = require('../db/connection');
const { todayStr } = require('../utils/helpers');

const router = express.Router();

router.get('/summary', (req, res) => {
  const today = todayStr();

  const totalPatients = db.prepare("SELECT COUNT(*) AS c FROM patients WHERE status = 'active'").get().c;

  const todaysAppointments = db
    .prepare("SELECT COUNT(*) AS c FROM therapy_sessions WHERE session_date = ? AND status = 'scheduled'")
    .get(today).c;

  const vaccinesDueSoon = db
    .prepare(
      `SELECT COUNT(*) AS c FROM patient_vaccinations
       WHERE status = 'pending' AND scheduled_date BETWEEN ? AND date(?, '+7 days')`
    )
    .get(today, today).c;

  const vaccinesOverdue = db
    .prepare("SELECT COUNT(*) AS c FROM patient_vaccinations WHERE status = 'pending' AND scheduled_date < ?")
    .get(today).c;

  const feesSummary = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount_paid ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN payment_status IN ('pending','partial') THEN amount - amount_paid ELSE 0 END), 0) AS total_pending
       FROM fees`
    )
    .get();

  const roomsInUseNow = db
    .prepare(
      `SELECT room_id FROM therapy_sessions
       WHERE session_date = ? AND status = 'scheduled'
       GROUP BY room_id`
    )
    .all(today).length;

  const totalRooms = db.prepare('SELECT COUNT(*) AS c FROM rooms WHERE active = 1').get().c;

  const swarnaCallsDue = db
    .prepare(
      `SELECT COUNT(*) AS c FROM swarna_prashana_doses
       WHERE call_status = 'not_called' AND scheduled_date BETWEEN ? AND date(?, '+7 days')`
    )
    .get(today, today).c;

  res.json({
    totalPatients,
    todaysAppointments,
    vaccinesDueSoon,
    vaccinesOverdue,
    feesCollected: feesSummary.total_collected,
    feesPending: feesSummary.total_pending,
    roomsInUseToday: roomsInUseNow,
    totalRooms,
    swarnaCallsDue,
  });
});

module.exports = router;
