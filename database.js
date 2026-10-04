import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

const db = new sqlite3.Database('./fixtrack.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

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
      contact TEXT
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
      at INTEGER NOT NULL
    )
  `);

  // Seed Admin Account
  const adminPass = bcrypt.hashSync('admin123', 10);
  db.run(
    `INSERT OR IGNORE INTO users (name, email, password, role, sem, phone, contact) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Admin', 'admin@college.edu', adminPass, 'admin', 0, '', 'admin@college.edu']
  );

  // Seed Demo Student Account
  const studentPass = bcrypt.hashSync('student123', 10);
  db.run(
    `INSERT OR IGNORE INTO users (name, email, password, role, sem, phone, contact) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Demo Student', 'student@college.edu', studentPass, 'user', 3, '9876543210', 'student@gmail.com']
  );
});

export default db;