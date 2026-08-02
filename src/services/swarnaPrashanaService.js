const db = require('../db/connection');

/**
 * Enrolls a patient in Swarna Prashana and creates their first dose record.
 * Shared between the dedicated enrollment endpoint and patient creation
 * (so a new patient can be auto-enrolled in one step).
 */
function enrollPatientInSwarnaPrashana(patientId, startDate, notes) {
  const insertEnrollment = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO swarna_prashana_enrollments (patient_id, start_date, notes) VALUES (?, ?, ?)')
      .run(patientId, startDate, notes || null);
    const enrollmentId = info.lastInsertRowid;
    db.prepare(
      `INSERT INTO swarna_prashana_doses (enrollment_id, patient_id, dose_number, scheduled_date)
       VALUES (?, ?, 1, ?)`
    ).run(enrollmentId, patientId, startDate);
    return enrollmentId;
  });

  const enrollmentId = insertEnrollment();
  return db.prepare('SELECT * FROM swarna_prashana_enrollments WHERE id = ?').get(enrollmentId);
}

module.exports = { enrollPatientInSwarnaPrashana };
