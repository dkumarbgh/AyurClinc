const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'clinic.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Thin compatibility wrapper around Node's built-in node:sqlite module,
 * shaped like the subset of the better-sqlite3 API this app uses
 * (.pragma, .exec, .prepare().get/.all/.run, .transaction).
 *
 * Using node:sqlite instead of better-sqlite3 means this app has ZERO
 * native/compiled dependencies — no Python, no Visual Studio Build Tools,
 * no node-gyp, on any OS. It requires Node.js 22.5+ (24+ recommended,
 * where node:sqlite no longer needs a flag and is more stable).
 */
class Db {
  constructor(filePath) {
    this._raw = new DatabaseSync(filePath);
  }

  pragma(statement) {
    this._raw.exec(`PRAGMA ${statement}`);
  }

  exec(sql) {
    this._raw.exec(sql);
  }

  prepare(sql) {
    const stmt = this._raw.prepare(sql);
    // Allows JS objects like { search: 'x' } to bind to SQL placeholders
    // written as @search / :search / $search, matching better-sqlite3's
    // ergonomics without needing to prefix every object key.
    if (typeof stmt.setAllowBareNamedParameters === 'function') {
      stmt.setAllowBareNamedParameters(true);
    }
    return stmt;
  }

  transaction(fn) {
    const raw = this._raw;
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
      }
    };
  }
}

const db = new Db(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Apply schema (idempotent — uses CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

/**
 * Lightweight migration helper: adds a column to an existing table if it's
 * not already there. CREATE TABLE IF NOT EXISTS (used above) only helps for
 * brand-new databases — on a database created by an earlier version of this
 * app, new columns added to schema.sql need to be patched in by hand like
 * this so upgrading doesn't require deleting existing data.
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migrated: added ${table}.${column}`);
  }
}

ensureColumn('admin_users', 'role', "TEXT NOT NULL DEFAULT 'admin'");
ensureColumn('admin_users', 'active', 'INTEGER NOT NULL DEFAULT 1');

// Ensure the 4 therapy rooms always exist
const roomCount = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
if (roomCount === 0) {
  const insertRoom = db.prepare('INSERT INTO rooms (room_number, room_name, capacity) VALUES (?, ?, ?)');
  const insertMany = db.transaction((rooms) => {
    for (const r of rooms) insertRoom.run(r.room_number, r.room_name, r.capacity);
  });
  insertMany([
    { room_number: 1, room_name: 'Therapy Room 1', capacity: 1 },
    { room_number: 2, room_name: 'Therapy Room 2', capacity: 1 },
    { room_number: 3, room_name: 'Therapy Room 3', capacity: 1 },
    { room_number: 4, room_name: 'Therapy Room 4', capacity: 1 },
  ]);
  console.log('Seeded 4 default therapy rooms.');
}

// Ensure the single clinic_settings row always exists
const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM clinic_settings').get().c;
if (settingsCount === 0) {
  db.prepare('INSERT INTO clinic_settings (id, clinic_name) VALUES (1, ?)').run('Your Clinic Name');
  console.log('Seeded default clinic settings — update these from the Settings page.');
}

module.exports = db;
