require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./connection');

function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) {
    console.log(`Admin user "${username}" already exists — skipping.`);
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, 'Clinic Administrator', 'admin');
  console.log(`Created admin user "${username}" with the password from .env (or default "admin123").`);
}

function seedVaccines() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM vaccines').get().c;
  if (count > 0) {
    console.log('Vaccine master list already populated — skipping.');
    return;
  }
  const insert = db.prepare(
    'INSERT INTO vaccines (name, description, recurring_interval_months, total_doses) VALUES (?, ?, ?, ?)'
  );
  const rows = [
    ['Monthly Immunotherapy Dose', 'Recurring monthly immunotherapy/allergy vaccine dose', 1, null],
    ['Hepatitis B (Series)', '3-dose hepatitis B vaccination series', null, 3],
    ['Influenza (Annual)', 'Seasonal flu vaccine', 12, null],
    ['Tetanus Booster', 'One-off tetanus booster shot', null, 1],
  ];
  const insertMany = db.transaction((items) => {
    for (const [name, description, interval, doses] of items) {
      insert.run(name, description, interval, doses);
    }
  });
  insertMany(rows);
  console.log('Seeded default vaccine master list.');
}

seedAdmin();
seedVaccines();
console.log('Seeding complete.');
