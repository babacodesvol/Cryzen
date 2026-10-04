import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'fixtrack_super_secret_key_123';

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support base64 image uploads
app.use(express.static('.')); // Serve frontend static files (index.html, style.css, script.js)

// Middleware: Authenticate JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// ---------------- USER AUTHENTICATION ----------------

// Register Student
app.post('/api/auth/signup', (req, res) => {
  const { name, email, pass, sem, phone, contact } = req.body;

  if (!name || !email || !pass) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const hashedPassword = bcrypt.hashSync(pass, 10);

  const query = `INSERT INTO users (name, email, password, role, sem, phone, contact) VALUES (?, ?, ?, 'user', ?, ?, ?)`;
  db.run(query, [name, email.toLowerCase(), hashedPassword, sem || 1, phone || '', contact || ''], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'This email is already registered.' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    const user = { id: this.lastID, name, email: email.toLowerCase(), role: 'user', sem, phone, contact };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  });
});

// Login User/Admin
app.post('/api/auth/login', (req, res) => {
  const { email, pass, role } = req.body;

  db.get('SELECT * FROM users WHERE email = ? AND role = ?', [email.toLowerCase(), role], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: role === 'admin' ? 'Admin credentials not recognized.' : 'Email or password is wrong.' });
    }

    const validPass = bcrypt.compareSync(pass, user.password);
    if (!validPass) {
      return res.status(400).json({ error: 'Email or password is wrong.' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sem: user.sem,
      phone: user.phone,
      contact: user.contact
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: payload });
  });
});

// Get Logged In User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ---------------- ISSUES / REPORTS ----------------

// Fetch Reports
app.get('/api/reports', authenticateToken, (req, res) => {
  const query = req.user.role === 'admin'
    ? 'SELECT * FROM reports ORDER BY at DESC'
    : 'SELECT * FROM reports WHERE by_email = ? ORDER BY at DESC';

  const params = req.user.role === 'admin' ? [] : [req.user.email];

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch reports' });
    const formatted = rows.map(r => ({
      id: r.id,
      by: r.by_email,
      byName: r.by_name,
      photo: r.photo,
      desc: r.desc,
      cat: r.cat,
      loc: r.loc,
      geo: r.geo,
      status: r.status,
      term: r.term,
      at: r.at
    }));
    res.json(formatted);
  });
});

// Create Report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { photo, desc, cat, loc, geo, term } = req.body;

  if (!photo || !desc) {
    return res.status(400).json({ error: 'Photo and description are required.' });
  }

  const at = Date.now();
  const query = `INSERT INTO reports (by_email, by_name, photo, desc, cat, loc, geo, status, term, at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`;

  db.run(query, [req.user.email, req.user.name, photo, desc, cat, loc, geo, term, at], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to save report' });
    res.json({ id: this.lastID, message: 'Report created successfully' });
  });
});

// Update Report Status (Admin Only)
app.patch('/api/reports/:id/status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update status.' });
  }

  const { status } = req.body;
  db.run('UPDATE reports SET status = ? WHERE id = ?', [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update status' });
    res.json({ message: 'Status updated successfully' });
  });
});

app.listen(PORT, () => {
  console.log(`FixTrack server running at http://localhost:${PORT}`);
});