const cron = require('node-cron');
const db = require('../db/connection');
const whatsapp = require('./whatsappService');
const { todayStr } = require('../utils/helpers');

const REMINDER_DAYS_BEFORE = parseInt(process.env.VACCINE_REMINDER_DAYS_BEFORE || '3', 10);

/**
 * Find pending vaccinations due within REMINDER_DAYS_BEFORE days (or already
 * overdue) that have not had a reminder sent yet, and WhatsApp the patient.
 */
async function runVaccineReminders() {
  const today = todayStr();
  const dueBy = new Date();
  dueBy.setUTCDate(dueBy.getUTCDate() + REMINDER_DAYS_BEFORE);
  const dueByStr = dueBy.toISOString().slice(0, 10);

  const due = db.prepare(
    `SELECT pv.id, pv.scheduled_date, pv.dose_number, p.id AS patient_id, p.full_name,
            COALESCE(p.whatsapp_number, p.phone) AS phone, v.name AS vaccine_name
     FROM patient_vaccinations pv
     JOIN patients p ON p.id = pv.patient_id
     JOIN vaccines v ON v.id = pv.vaccine_id
     WHERE pv.status = 'pending'
       AND pv.reminder_sent_at IS NULL
       AND pv.scheduled_date <= ?
       AND p.status = 'active'`
  ).all(dueByStr);

  for (const row of due) {
    const overdue = row.scheduled_date < today;
    const message =
      `Hi ${row.full_name}, this is a reminder from the clinic that your ` +
      `${row.vaccine_name} (dose ${row.dose_number}) is ${overdue ? 'overdue' : 'scheduled'} ` +
      `for ${row.scheduled_date}. Please visit the clinic or contact us to confirm your appointment.`;

    await whatsapp.sendMessage({
      to: row.phone,
      message,
      type: 'vaccine_reminder',
      patientId: row.patient_id,
    });

    db.prepare('UPDATE patient_vaccinations SET reminder_sent_at = datetime(\'now\') WHERE id = ?').run(row.id);
  }

  if (due.length) console.log(`Vaccine reminders sent/stubbed for ${due.length} patient(s).`);
  return due.length;
}

/** Remind patients of therapy sessions scheduled for tomorrow. */
async function runAppointmentReminders() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const sessions = db.prepare(
    `SELECT ts.id, ts.session_date, ts.start_time, p.id AS patient_id, p.full_name,
            COALESCE(p.whatsapp_number, p.phone) AS phone, r.room_name, t.full_name AS therapist_name
     FROM therapy_sessions ts
     JOIN patients p ON p.id = ts.patient_id
     JOIN rooms r ON r.id = ts.room_id
     JOIN therapists t ON t.id = ts.therapist_id
     WHERE ts.session_date = ? AND ts.status = 'scheduled'`
  ).all(tomorrowStr);

  for (const row of sessions) {
    const message =
      `Hi ${row.full_name}, reminder: you have a therapy session tomorrow (${row.session_date}) ` +
      `at ${row.start_time} in ${row.room_name} with ${row.therapist_name}. See you then!`;
    await whatsapp.sendMessage({
      to: row.phone,
      message,
      type: 'appointment_reminder',
      patientId: row.patient_id,
    });
  }

  if (sessions.length) console.log(`Appointment reminders sent/stubbed for ${sessions.length} session(s).`);
  return sessions.length;
}

/** Remind patients of pending/overdue fees. */
async function runFeeReminders() {
  const today = todayStr();
  const pending = db.prepare(
    `SELECT f.id, f.amount, f.amount_paid, f.due_date, p.id AS patient_id, p.full_name,
            COALESCE(p.whatsapp_number, p.phone) AS phone
     FROM fees f
     JOIN patients p ON p.id = f.patient_id
     WHERE f.payment_status IN ('pending','partial')
       AND f.due_date IS NOT NULL AND f.due_date <= ?
       AND p.status = 'active'`
  ).all(today);

  for (const row of pending) {
    const balance = row.amount - row.amount_paid;
    const message =
      `Hi ${row.full_name}, this is a reminder that a payment of Rs.${balance.toFixed(2)} ` +
      `is due at the clinic (due date: ${row.due_date}). Please clear it at your earliest convenience.`;
    await whatsapp.sendMessage({
      to: row.phone,
      message,
      type: 'fee_reminder',
      patientId: row.patient_id,
    });
  }

  if (pending.length) console.log(`Fee reminders sent/stubbed for ${pending.length} invoice(s).`);
  return pending.length;
}

/** Register all cron schedules. Call once at server startup. */
function startReminderJobs() {
  const schedule = process.env.REMINDER_CRON_SCHEDULE || '0 9 * * *'; // daily at 9am server time

  cron.schedule(schedule, () => {
    runVaccineReminders().catch((e) => console.error('Vaccine reminder job failed:', e));
    runAppointmentReminders().catch((e) => console.error('Appointment reminder job failed:', e));
    runFeeReminders().catch((e) => console.error('Fee reminder job failed:', e));
  });

  console.log(`Reminder jobs scheduled with cron pattern "${schedule}".`);
}

module.exports = { startReminderJobs, runVaccineReminders, runAppointmentReminders, runFeeReminders };
