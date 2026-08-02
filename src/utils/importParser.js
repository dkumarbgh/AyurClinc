const XLSX = require('xlsx');

/**
 * Turns a variety of "column header spellings" into our canonical patient
 * field names, so an uploaded sheet doesn't have to match exactly.
 * e.g. "Patient Name", "Full Name", "Name" all map to full_name.
 */
const HEADER_ALIASES = {
  full_name: ['fullname', 'name', 'patientname', 'childname', 'kidname'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber'],
  whatsapp_number: ['whatsapp', 'whatsappnumber', 'whatsappno'],
  dob: ['dob', 'dateofbirth', 'birthdate', 'birthday'],
  gender: ['gender', 'sex'],
  email: ['email', 'emailaddress'],
  address: ['address', 'homeaddress'],
  guardian_name: ['guardian', 'guardianname', 'parentname', 'fathername', 'mothername', 'careof'],
  guardian_phone: ['guardianphone', 'guardiannumber', 'guardiancontact', 'parentphone', 'parentnumber'],
  blood_group: ['bloodgroup', 'bloodtype'],
  medical_notes: ['medicalnotes', 'notes', 'remarks', 'comments'],
};

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build a flat lookup: normalized alias -> canonical field name (includes the field name itself).
const FIELD_LOOKUP = {};
for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
  FIELD_LOOKUP[normalizeKey(field)] = field;
  for (const alias of aliases) FIELD_LOOKUP[normalizeKey(alias)] = field;
}

function mapRowToPatient(rawRow) {
  const mapped = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const field = FIELD_LOOKUP[normalizeKey(key)];
    if (field && value !== undefined && value !== null && String(value).trim() !== '') {
      mapped[field] = String(value).trim();
    }
  }
  return mapped;
}

/** Normalize a parsed date value (Excel may hand back a Date object or a serial number) to YYYY-MM-DD. */
function normalizeDob(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (common outside the US)
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return str;
}

/**
 * Parses an uploaded file buffer (xlsx, xls, csv, or json) into an array of
 * plain row objects with raw (un-mapped) keys as found in the file.
 */
function parseFileToRows(buffer, originalFilename) {
  const ext = (originalFilename.split('.').pop() || '').toLowerCase();

  if (ext === 'json') {
    const text = buffer.toString('utf8');
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('JSON file must contain an array of patient objects.');
    }
    return data;
  }

  // xlsx handles .xlsx, .xls, and .csv all through the same read path.
  // raw:false + dateNF keeps things like "+919800011111" as text instead of
  // silently becoming the number 919800011111, while still formatting real
  // date cells as plain YYYY-MM-DD instead of a locale-short date.
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, dateNF: 'yyyy-mm-dd' });
}

module.exports = { parseFileToRows, mapRowToPatient, normalizeDob };
