/**
 * Populates the database with realistic sample data — patients, therapists,
 * appointments, vaccinations, fees, Swarna Prashana enrollments, staff
 * accounts, and a few WhatsApp log entries — so you can explore the app
 * without hand-typing everything first.
 *
 * Run with: npm run sample-data
 *
 * Safe to run on a database that already has the base seed data (admin
 * user + vaccine list) — it ensures that via `require('./seed')`. It will
 * refuse to run twice on top of itself (to avoid duplicate clutter); delete
 * clinic.db and run `npm run seed` again first if you want a clean re-run.
 */
require('./seed'); // ensures admin user + vaccine master list exist first

const bcrypt = require('bcryptjs');
const db = require('./connection');
const { nextPatientCode, addDays, addMonths, todayStr } = require('../utils/helpers');
const { enrollPatientInSwarnaPrashana } = require('../services/swarnaPrashanaService');

const today = todayStr();

function guard() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
  if (count > 0) {
    console.log(
      `There are already ${count} patient(s) in the database — skipping sample data to avoid duplicates.\n` +
      `To start fresh: stop the server, delete clinic.db, run "npm run seed", then "npm run sample-data" again.`
    );
    process.exit(0);
  }
}

function insertPatient(p) {
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
      full_name: p.full_name,
      dob: p.dob || null,
      gender: p.gender || null,
      phone: p.phone,
      whatsapp_number: p.whatsapp_number || null,
      email: p.email || null,
      address: p.address || null,
      guardian_name: p.guardian_name || null,
      guardian_phone: p.guardian_phone || null,
      blood_group: p.blood_group || null,
      medical_notes: p.medical_notes || null,
    });
  return { id: info.lastInsertRowid, patient_code, ...p };
}

function insertTherapist(t) {
  const info = db
    .prepare('INSERT INTO therapists (full_name, specialization, phone, email) VALUES (?, ?, ?, ?)')
    .run(t.full_name, t.specialization, t.phone, t.email || null);
  return info.lastInsertRowid;
}

function insertStaffUser(username, password, full_name, role) {
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, full_name, role);
}

function insertAppointment(patientId, therapistId, roomId, date, start, end, status, notes) {
  db.prepare(
    `INSERT INTO therapy_sessions (patient_id, therapist_id, room_id, session_date, start_time, end_time, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(patientId, therapistId, roomId, date, start, end, status, notes || null);
}

function insertFee(patientId, purpose, amount, amountPaid, status, dueDate, paidDate, method, createdAt) {
  db.prepare(
    `INSERT INTO fees (patient_id, purpose, amount, amount_paid, payment_status, due_date, paid_date, payment_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(patientId, purpose, amount, amountPaid, status, dueDate, paidDate, method, createdAt);
}

function insertVaccinationRecord(patientId, vaccineId, doseNumber, scheduledDate, status, administeredDate, administeredBy) {
  db.prepare(
    `INSERT INTO patient_vaccinations (patient_id, vaccine_id, dose_number, scheduled_date, status, administered_date, administered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(patientId, vaccineId, doseNumber, scheduledDate, status, administeredDate, administeredBy);
}

function insertWhatsappLog(patientId, phone, message, type, status, createdAt) {
  db.prepare(
    `INSERT INTO whatsapp_logs (patient_id, phone, message, message_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(patientId, phone, message, type, status, createdAt);
}

function run() {
  guard();
  console.log('Seeding sample data...');

  // ---------------- Staff accounts ----------------
  insertStaffUser('reception', 'reception123', 'Reception Riya', 'front_desk');
  insertStaffUser('anita', 'therapist123', 'Nurse Anita', 'therapist');
  console.log('  Added staff accounts: reception / reception123 (front desk), anita / therapist123 (therapist)');

  // ---------------- Therapists ----------------
  const drPriya = insertTherapist({ full_name: 'Dr. Priya Nair', specialization: 'Occupational Therapy', phone: '+919800011122', email: 'priya.nair@example.com' });
  const drKiran = insertTherapist({ full_name: 'Dr. Kiran Mehta', specialization: 'Speech Therapy', phone: '+919800022233', email: 'kiran.mehta@example.com' });
  const drAnanth = insertTherapist({ full_name: 'Dr. Ananth Rao', specialization: 'Physiotherapy', phone: '+919800033344', email: 'ananth.rao@example.com' });
  console.log('  Added 3 therapists');

  // ---------------- Patients ----------------
  const patients = [
    { full_name: 'Baby Aarav Sharma', dob: addMonths(today, -8), gender: 'male', phone: '+919811100011', guardian_name: 'Sunita Sharma', guardian_phone: '+919822200022', address: 'Vijayanagar, Mysuru', blood_group: 'O+' },
    { full_name: 'Baby Diya Patel', dob: addMonths(today, -5), gender: 'female', phone: '+919811100022', guardian_name: 'Rajesh Patel', guardian_phone: '+919822200033', address: 'Kuvempunagar, Mysuru' },
    { full_name: 'Kabir Singh', dob: addMonths(today, -22), gender: 'male', phone: '+919811100033', guardian_name: 'Harpreet Singh', guardian_phone: '+919822200044', address: 'Jayalakshmipuram, Mysuru', blood_group: 'B+' },
    { full_name: 'Zara Khan', dob: addMonths(today, -18), gender: 'female', phone: '+919811100044', guardian_name: 'Ayesha Khan', guardian_phone: '+919822200055', address: 'Saraswathipuram, Mysuru' },
    { full_name: 'Meera Iyer', dob: addMonths(today, -48), gender: 'female', phone: '+919811100055', guardian_name: 'Lakshmi Iyer', guardian_phone: '+919822200066', address: 'Gokulam, Mysuru', blood_group: 'A+' },
    { full_name: 'Rohan Gupta', dob: addMonths(today, -60), gender: 'male', phone: '+919811100066', guardian_name: 'Anil Gupta', guardian_phone: '+919822200077', address: 'V.V. Mohalla, Mysuru' },
    { full_name: 'Ananya Reddy', dob: addMonths(today, -3), gender: 'female', phone: '+919811100077', guardian_name: 'Divya Reddy', guardian_phone: '+919822200088', address: 'Hebbal, Mysuru', medical_notes: 'Premature birth, monitoring development milestones.' },
    { full_name: 'Aditya Rao', dob: addMonths(today, -84), gender: 'male', phone: '+919811100088', guardian_name: 'Suresh Rao', guardian_phone: '+919822200099', address: 'Kuvempunagar, Mysuru', blood_group: 'AB+' },
  ];
  const p = patients.map(insertPatient);
  console.log(`  Added ${p.length} patients`);

  // ---------------- Vaccinations ----------------
  const monthlyVaccineId = db.prepare("SELECT id FROM vaccines WHERE recurring_interval_months = 1").get()?.id;
  const hepBId = db.prepare("SELECT id FROM vaccines WHERE name LIKE 'Hepatitis%'").get()?.id;
  const tetanusId = db.prepare("SELECT id FROM vaccines WHERE name LIKE 'Tetanus%'").get()?.id;

  if (monthlyVaccineId) {
    insertVaccinationRecord(p[0].id, monthlyVaccineId, 1, addDays(today, -35), 'administered', addDays(today, -35), 'Nurse Anita');
    insertVaccinationRecord(p[0].id, monthlyVaccineId, 2, addDays(today, -4), 'pending', null, null); // overdue
    insertVaccinationRecord(p[2].id, monthlyVaccineId, 1, addDays(today, 3), 'pending', null, null); // due soon
  }
  if (hepBId) {
    insertVaccinationRecord(p[1].id, hepBId, 1, addDays(today, -60), 'administered', addDays(today, -60), 'Dr. Kiran Mehta');
    insertVaccinationRecord(p[1].id, hepBId, 2, addDays(today, 2), 'pending', null, null);
    insertVaccinationRecord(p[6].id, hepBId, 1, addDays(today, 6), 'pending', null, null);
  }
  if (tetanusId) {
    insertVaccinationRecord(p[4].id, tetanusId, 1, addDays(today, -400), 'administered', addDays(today, -400), 'Dr. Priya Nair');
  }
  console.log('  Added vaccination records (mix of administered / due soon / overdue)');

  // ---------------- Appointments ----------------
  insertAppointment(p[2].id, drPriya, 1, today, '10:00', '11:00', 'scheduled');
  insertAppointment(p[3].id, drKiran, 2, today, '11:30', '12:15', 'scheduled');
  insertAppointment(p[4].id, drAnanth, 3, today, '14:00', '14:45', 'scheduled');
  insertAppointment(p[5].id, drPriya, 1, addDays(today, 1), '10:00', '11:00', 'scheduled');
  insertAppointment(p[7].id, drKiran, 4, addDays(today, 1), '15:00', '15:45', 'scheduled');
  insertAppointment(p[2].id, drPriya, 1, addDays(today, -1), '10:00', '11:00', 'completed', 'Good progress this session.');
  insertAppointment(p[4].id, drAnanth, 3, addDays(today, -2), '14:00', '14:45', 'cancelled', 'Patient unwell, rescheduling.');
  insertAppointment(p[3].id, drKiran, 2, addDays(today, 3), '11:30', '12:15', 'scheduled');
  console.log('  Added 8 therapy appointments across all 4 rooms');

  // ---------------- Fees ----------------
  insertFee(p[2].id, 'therapy_session', 1200, 1200, 'paid', null, addDays(today, -1), 'upi', addDays(today, -1) + ' 10:00:00');
  insertFee(p[3].id, 'therapy_session', 1200, 600, 'partial', addDays(today, 5), null, 'cash', addDays(today, -2) + ' 09:00:00');
  insertFee(p[4].id, 'consultation', 500, 0, 'pending', addDays(today, -3), null, null, addDays(today, -10) + ' 09:00:00'); // overdue
  insertFee(p[5].id, 'registration', 300, 300, 'paid', null, addDays(today, -20), 'cash', addDays(today, -20) + ' 09:00:00');
  insertFee(p[7].id, 'therapy_session', 1200, 0, 'pending', addDays(today, 7), null, null, today + ' 09:00:00');
  insertFee(p[0].id, 'vaccine', 400, 400, 'paid', null, addDays(today, -35), 'upi', addDays(today, -35) + ' 09:00:00');
  console.log('  Added 6 fee records (paid / partial / pending / overdue)');

  // ---------------- Swarna Prashana ----------------
  // Aarav: enrolled 2 months ago, first dose administered, second dose overdue and not yet called
  const enrollAarav = enrollPatientInSwarnaPrashana(p[0].id, addDays(today, -65));
  const doseAarav1 = db.prepare('SELECT * FROM swarna_prashana_doses WHERE enrollment_id = ? AND dose_number = 1').get(enrollAarav.id);
  db.prepare("UPDATE swarna_prashana_doses SET dose_status='administered', administered_date=?, administered_by=?, call_status='called', called_by='Nurse Anita', called_at=? WHERE id=?")
    .run(addDays(today, -65), 'Dr. Kiran Mehta', addDays(today, -67) + ' 10:00:00', doseAarav1.id);
  db.prepare(
    `INSERT INTO swarna_prashana_doses (enrollment_id, patient_id, dose_number, scheduled_date, call_status, dose_status)
     VALUES (?, ?, 2, ?, 'not_called', 'pending')`
  ).run(enrollAarav.id, p[0].id, addDays(today, -5));

  // Diya: enrolled 1 month ago, called and confirmed, dose due in 2 days
  const enrollDiya = enrollPatientInSwarnaPrashana(p[1].id, addDays(today, 2));
  db.prepare("UPDATE swarna_prashana_doses SET call_status='called', called_by='Nurse Anita', called_at=? WHERE enrollment_id=? AND dose_number=1")
    .run(addDays(today, -1) + ' 16:00:00', enrollDiya.id);

  // Ananya: enrolled, called but no answer, due soon (will show the WhatsApp-nudge pattern in the log)
  const enrollAnanya = enrollPatientInSwarnaPrashana(p[6].id, addDays(today, 1));
  db.prepare("UPDATE swarna_prashana_doses SET call_status='no_answer', called_by='Reception Riya', called_at=? WHERE enrollment_id=? AND dose_number=1")
    .run(addDays(today, -1) + ' 11:00:00', enrollAnanya.id);

  // Kabir: enrolled, parent declined this month
  const enrollKabir = enrollPatientInSwarnaPrashana(p[2].id, addDays(today, -2));
  db.prepare("UPDATE swarna_prashana_doses SET call_status='rejected', called_by='Nurse Anita', called_at=?, call_notes='Parent said maybe next month.' WHERE enrollment_id=? AND dose_number=1")
    .run(addDays(today, -3) + ' 12:00:00', enrollKabir.id);

  console.log('  Enrolled 4 patients in Swarna Prashana with varied call/dose statuses');

  // ---------------- WhatsApp logs ----------------
  insertWhatsappLog(p[0].id, '+919822200022', `Hi Sunita Sharma, reminder: Baby Aarav Sharma's Swarna Prashana dose was scheduled for ${addDays(today, -5)}. Please visit the clinic.`, 'swarna_prashana_reminder', 'stubbed', addDays(today, -4) + ' 09:05:00');
  insertWhatsappLog(p[6].id, '+919822200088', `Hi, we tried calling about Ananya Reddy's Swarna Prashana dose scheduled for ${addDays(today, 1)}. Please call the clinic back.`, 'swarna_prashana_reminder', 'stubbed', addDays(today, -1) + ' 11:05:00');
  insertWhatsappLog(p[2].id, '+919822200044', 'Hi Harpreet Singh, we\u2019ve received your payment of Rs.1200.00. Thank you!', 'payment_confirmation', 'stubbed', addDays(today, -1) + ' 10:05:00');
  console.log('  Added 3 sample WhatsApp log entries');

  console.log('\nSample data seeding complete.');
  console.log('Sign in as: admin / (your ADMIN_PASSWORD), reception / reception123, or anita / therapist123');
}

run();
