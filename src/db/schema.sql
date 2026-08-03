-- ============================================================
-- Clinic Management System — SQLite Schema
-- ============================================================
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------------- Admin users (dashboard login) ----------------
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','front_desk','therapist')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------------- Audit log ----------------
-- Automatically populated for every authenticated, non-GET API request that
-- succeeds (see src/middleware/audit.js) — a lightweight "who did what when"
-- trail without having to hand-instrument every route.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  username TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ---------------- Patients ----------------
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT CHECK (gender IN ('male','female','other') OR gender IS NULL),
  phone TEXT NOT NULL,
  whatsapp_number TEXT,
  email TEXT,
  address TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  blood_group TEXT,
  medical_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

-- ---------------- Vaccine master list ----------------
CREATE TABLE IF NOT EXISTS vaccines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  recurring_interval_months INTEGER,   -- e.g. 1 = monthly dose series; NULL = one-off
  total_doses INTEGER,                 -- optional cap on number of doses in the series
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------------- Patient vaccination schedule/history ----------------
CREATE TABLE IF NOT EXISTS patient_vaccinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine_id INTEGER NOT NULL REFERENCES vaccines(id) ON DELETE RESTRICT,
  dose_number INTEGER NOT NULL DEFAULT 1,
  scheduled_date TEXT NOT NULL,
  administered_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','administered','missed','cancelled')),
  administered_by TEXT,
  reminder_sent_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pv_patient ON patient_vaccinations(patient_id);
CREATE INDEX IF NOT EXISTS idx_pv_scheduled_date ON patient_vaccinations(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_pv_status ON patient_vaccinations(status);

-- ---------------- Therapists ----------------
CREATE TABLE IF NOT EXISTS therapists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  working_days TEXT DEFAULT '["Mon","Tue","Wed","Thu","Fri","Sat"]', -- JSON array
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ---------------- Therapy rooms (fixed at 4) ----------------
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_number INTEGER UNIQUE NOT NULL,
  room_name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

-- ---------------- Therapy sessions / appointments ----------------
CREATE TABLE IF NOT EXISTS therapy_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  therapist_id INTEGER NOT NULL REFERENCES therapists(id) ON DELETE RESTRICT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  session_date TEXT NOT NULL,   -- YYYY-MM-DD
  start_time TEXT NOT NULL,     -- HH:MM (24h)
  end_time TEXT NOT NULL,       -- HH:MM (24h)
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ts_date ON therapy_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_ts_room ON therapy_sessions(room_id, session_date);
CREATE INDEX IF NOT EXISTS idx_ts_therapist ON therapy_sessions(therapist_id, session_date);
CREATE INDEX IF NOT EXISTS idx_ts_patient ON therapy_sessions(patient_id);

-- ---------------- Fees / payments ----------------
CREATE TABLE IF NOT EXISTS fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES therapy_sessions(id) ON DELETE SET NULL,
  vaccination_id INTEGER REFERENCES patient_vaccinations(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'other' CHECK (purpose IN ('consultation','therapy_session','vaccine','registration','other')),
  amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash','card','upi','bank_transfer','other') OR payment_method IS NULL),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid','pending','partial','refunded')),
  due_date TEXT,
  paid_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fees_patient ON fees(patient_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(payment_status);
CREATE INDEX IF NOT EXISTS idx_fees_due_date ON fees(due_date);

-- ---------------- WhatsApp message logs ----------------
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'general' CHECK (message_type IN ('vaccine_reminder','appointment_reminder','fee_reminder','payment_confirmation','swarna_prashana_reminder','general')),
  status TEXT NOT NULL DEFAULT 'stubbed' CHECK (status IN ('stubbed','sent','failed')),
  provider_response TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wa_patient ON whatsapp_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_wa_created ON whatsapp_logs(created_at);

-- ---------------- Swarna Prashana (monthly immunity dose) ----------------
-- A patient is "enrolled" once; the program then produces one dose record
-- per month for as long as the enrollment stays active.
CREATE TABLE IF NOT EXISTS swarna_prashana_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spe_patient ON swarna_prashana_enrollments(patient_id);
CREATE INDEX IF NOT EXISTS idx_spe_status ON swarna_prashana_enrollments(status);

-- One row per monthly dose. call_status tracks the therapist's phone call to
-- the parent; dose_status tracks whether the child actually came in and
-- received the dose. These are independent — a parent can say yes on the
-- call but the visit can still be marked missed, etc.
CREATE TABLE IF NOT EXISTS swarna_prashana_doses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES swarna_prashana_enrollments(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  dose_number INTEGER NOT NULL DEFAULT 1,
  scheduled_date TEXT NOT NULL,
  call_status TEXT NOT NULL DEFAULT 'not_called' CHECK (call_status IN ('not_called','called','no_answer','rejected')),
  call_notes TEXT,
  called_by TEXT,
  called_at TEXT,
  dose_status TEXT NOT NULL DEFAULT 'pending' CHECK (dose_status IN ('pending','administered','missed','cancelled')),
  administered_date TEXT,
  administered_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spd_patient ON swarna_prashana_doses(patient_id);
CREATE INDEX IF NOT EXISTS idx_spd_enrollment ON swarna_prashana_doses(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_spd_scheduled ON swarna_prashana_doses(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_spd_call_status ON swarna_prashana_doses(call_status);

-- ---------------- Clinic settings ----------------
-- Single-row table holding the clinic's identity info, used as the
-- letterhead on generated PDFs (invoices, certificates, insurance bills).
CREATE TABLE IF NOT EXISTS clinic_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  clinic_name TEXT NOT NULL DEFAULT 'Your Clinic Name',
  address TEXT,
  phone TEXT,
  email TEXT,
  registration_number TEXT,
  default_doctor_name TEXT,
  default_doctor_reg_no TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
