import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

const db = new sqlite3.Database('./fixtrack.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Same term logic as the frontend: Jan-Jun = Spring, Jul-Dec = Autumn
export const termNow = () => {
  const d = new Date();
  return d.getFullYear() + (d.getMonth() < 6 ? ' Spring' : ' Autumn');
};

// Admin accounts: [name, email, password]. Add a line here to create another admin.
// The first one is the main admin (it also receives reports sent without an admin email).
const ADMINS = [
  ['Admin', 'admin@college.edu', 'admin123'],
  ['Dean', 'dean@college.edu', 'dean123'],
  ['Registrar', 'registrar@college.edu', 'registrar123'],
  ['Hostel Warden', 'warden@college.edu', 'warden123']
];

// Initialize tables and seed initial demo accounts
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('user', 'admin')) NOT NULL DEFAULT 'user',
      sem INTEGER,
      phone TEXT,
      contact TEXT,
      banned INTEGER NOT NULL DEFAULT 0,
      sem_term TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      by_email TEXT NOT NULL,
      by_name TEXT NOT NULL,
      photo TEXT NOT NULL,
      desc TEXT NOT NULL,
      cat TEXT NOT NULL,
      loc TEXT,
      geo TEXT,
      status TEXT CHECK(status IN ('new', 'proc', 'done')) NOT NULL DEFAULT 'new',
      term TEXT NOT NULL,
      at INTEGER NOT NULL,
      share_to TEXT NOT NULL DEFAULT 'Admin',
      share_name TEXT NOT NULL DEFAULT '',
      refer_to TEXT NOT NULL DEFAULT ''
    )
  `);

  // Profile changes asked by students, waiting for admin approval
  db.run(`
    CREATE TABLE IF NOT EXISTS profile_requests (
      user_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sem INTEGER NOT NULL,
      phone TEXT,
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      at INTEGER NOT NULL
    )
  `);

  // Migrations for an existing fixtrack.db (errors are ignored when the column already exists)
  db.run('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0', () => {});
  db.run('ALTER TABLE users ADD COLUMN sem_term TEXT', () => {});
  db.run("ALTER TABLE reports ADD COLUMN share_to TEXT NOT NULL DEFAULT 'Admin'", () => {});
  db.run("ALTER TABLE reports ADD COLUMN share_name TEXT NOT NULL DEFAULT ''", () => {});
  db.run("ALTER TABLE reports ADD COLUMN refer_to TEXT NOT NULL DEFAULT ''", () => {});
  db.run('UPDATE users SET sem_term = ? WHERE sem_term IS NULL', [termNow()]);

  // Seed Admin Accounts
  ADMINS.forEach(([name, email, pass]) => {
    db.run(
      `INSERT OR IGNORE INTO users (name, email, password, role, sem, phone, contact, sem_term) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, bcrypt.hashSync(pass, 10), 'admin', 0, '', email, termNow()]
    );
  });

  // Seed Demo Student Account
  const studentPass = bcrypt.hashSync('student123', 10);
  db.run(
    `INSERT OR IGNORE INTO users (name, email, password, role, sem, phone, contact, sem_term) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Demo Student', 'student@college.edu', studentPass, 'user', 3, '9876543210', 'student@gmail.com', termNow()]
  );
});

export default db;