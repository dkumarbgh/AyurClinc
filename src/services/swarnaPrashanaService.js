const db = require('../db/connection');

/**
 * Enrolls a patient in Swarna Prashana and creates their first dose record.
 * Shared between the dedicated enrollment endpoint, patient creation, and
 * bulk import (so a new patient can be auto-enrolled in one step).
 *
 * Deliberately does NOT wrap itself in a transaction — some callers (like
 * bulk import) already run inside one, and SQLite doesn't support nested
 * transactions. Callers that aren't already inside a transaction and want
 * this to be atomic should wrap the call themselves, e.g.
 * `db.transaction(() => enrollPatientInSwarnaPrashana(...))()`.
 */
function enrollPatientInSwarnaPrashana(patientId, startDate, notes) {
  const info = db
    .prepare('INSERT INTO swarna_prashana_enrollments (patient_id, start_date, notes) VALUES (?, ?, ?)')
    .run(patientId, startDate, notes || null);
  const enrollmentId = info.lastInsertRowid;
  db.prepare(
    `INSERT INTO swarna_prashana_doses (enrollment_id, patient_id, dose_number, scheduled_date)
     VALUES (?, ?, 1, ?)`
  ).run(enrollmentId, patientId, startDate);
  return db.prepare('SELECT * FROM swarna_prashana_enrollments WHERE id = ?').get(enrollmentId);
}

module.exports = { enrollPatientInSwarnaPrashana };
