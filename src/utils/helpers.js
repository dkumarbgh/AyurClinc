const db = require('../db/connection');

/** Generate the next sequential patient code, e.g. P00001 */
function nextPatientCode() {
  const row = db.prepare("SELECT patient_code FROM patients ORDER BY id DESC LIMIT 1").get();
  let nextNum = 1;
  if (row && row.patient_code) {
    const match = row.patient_code.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return 'P' + String(nextNum).padStart(5, '0');
}

/** Parse pagination params from a request query, with sane defaults/limits. */
function paginationParams(query, defaultLimit = 25, maxLimit = 100) {
  let limit = parseInt(query.limit, 10);
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(page) || page <= 0) page = 1;
  const offset = (page - 1) * limit;
  return { limit, page, offset };
}

/** Add N months to a YYYY-MM-DD date string, returned as YYYY-MM-DD. */
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Add N days to a YYYY-MM-DD date string, returned as YYYY-MM-DD. Negative N goes backward. */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD (UTC). */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { nextPatientCode, paginationParams, addMonths, addDays, todayStr };
