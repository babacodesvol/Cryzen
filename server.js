import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { termNow } from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fixtrack_super_secret_key_123';

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support base64 image uploads

// Never serve server code, the database or config files to the browser
const PRIVATE = /^\/(fixtrack\.db|server\.js|database\.js|package(-lock)?\.json|readme\.md|node_modules|\.)/i;
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) { return res.status(400).end(); }
  p = p.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (PRIVATE.test(p)) return res.status(404).end();
  next();
});
app.use(express.static('.')); // Serve frontend static files (index.html, style.css, script.js)

// ---------------- HELPERS ----------------

// Who a report can be shared with
const SHARE_OPTIONS = ['Admin', 'Dean', 'Registrar', 'Professor', 'Hostel warden', 'Other'];

// The main admin also receives reports that were sent without an admin email
const MAIN_ADMIN = 'admin@college.edu';

// Which reports an admin is allowed to see and change
const scope = (u) => u.email === MAIN_ADMIN
  ? { sql: "(refer_to = '' OR refer_to = ?)", params: [u.email] }
  : { sql: 'refer_to = ?', params: [u.email] };

// Semester counter: a student's semester goes up by 1 every new term (Jan / Jul)
const termIdx = (t) => { const [y, s] = String(t).split(' '); return (+y) * 2 + (s === 'Autumn' ? 1 : 0); };
const currentSem = (u) => u.role === 'admin' ? 0 : (u.sem || 1) + termIdx(termNow()) - termIdx(u.sem_term || termNow());
const graduated = (u) => u.role === 'user' && currentSem(u) > 8;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, sem: currentSem(u), phone: u.phone, contact: u.contact });

function removeUser(id, cb) {
  db.run('DELETE FROM profile_requests WHERE user_id = ?', [id]);
  db.run('DELETE FROM users WHERE id = ?', [id], cb || (() => {}));
}

// Delete student accounts that finished the 8th semester (reports are kept for the admin's records)
function purgeGraduated() {
  db.all("SELECT * FROM users WHERE role = 'user'", (err, rows) => {
    if (err) return;
    rows.filter(graduated).forEach((u) => removeUser(u.id));
  });
}
setTimeout(purgeGraduated, 3000);
setInterval(purgeGraduated, 6 * 60 * 60 * 1000);

const validProfile = ({ name, sem, phone, contact }) => {
  if (!name || !String(name).trim()) return 'Enter your name.';
  if (!Number.isInteger(+sem) || +sem < 1 || +sem > 8) return 'Semester must be between 1 and 8.';
  if (!/^[0-9+\-\s]{8,15}$/.test(phone || '')) return 'Enter a valid phone number.';
  if (!/^\S+@\S+\.\S+$/.test(contact || '')) return 'Enter a valid contact email.';
  return null;
};

// Middleware: Authenticate JWT Token (user is re-read from the DB so bans and approved edits apply instantly)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    db.get('SELECT * FROM users WHERE id = ?', [payload.id], (e, u) => {
      if (e || !u) return res.status(401).json({ error: 'Account not found. Please log in again.' });
      if (u.banned) return res.status(403).json({ error: 'Your account has been banned by the admin.' });
      if (graduated(u)) {
        removeUser(u.id);
        return res.status(401).json({ error: 'Your account was closed after the 8th semester.' });
      }
      req.user = publicUser(u);
      next();
    });
  });
}

const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access only.' });

// ---------------- USER AUTHENTICATION ----------------

// Register Student
app.post('/api/auth/signup', (req, res) => {
  const { name, email, pass, sem, phone, contact } = req.body;

  if (!name || !email || !pass) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  const hashedPassword = bcrypt.hashSync(pass, 10);
  const s = Math.min(8, Math.max(1, parseInt(sem) || 1));
  const term = termNow();

  const query = `INSERT INTO users (name, email, password, role, sem, phone, contact, sem_term) VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`;
  db.run(query, [name, email.toLowerCase(), hashedPassword, s, phone || '', contact || '', term], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'This email is already registered.' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    const user = publicUser({ id: this.lastID, name, email: email.toLowerCase(), role: 'user', sem: s, sem_term: term, phone, contact });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  });
});

// Login User/Admin
app.post('/api/auth/login', (req, res) => {
  const { email, pass, role } = req.body;

  db.get('SELECT * FROM users WHERE email = ? AND role = ?', [String(email || '').toLowerCase(), role], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: role === 'admin' ? 'Admin credentials not recognized.' : 'Email or password is wrong.' });
    }

    const validPass = bcrypt.compareSync(pass || '', user.password);
    if (!validPass) {
      return res.status(400).json({ error: 'Email or password is wrong.' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'Your account has been banned by the admin.' });
    }
    if (graduated(user)) {
      removeUser(user.id);
      return res.status(400).json({ error: 'Your account was closed after the 8th semester.' });
    }

    const payload = publicUser(user);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: payload });
  });
});

// Get Logged In User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ---------------- ISSUES / REPORTS ----------------

// Fetch Reports (student: own reports; admin: only reports sent to that admin, sorted by priority)
app.get('/api/reports', authenticateToken, (req, res) => {
  const admin = req.user.role === 'admin';
  const sc = admin ? scope(req.user) : null;
  const query = admin
    ? `SELECT * FROM reports WHERE ${sc.sql}`
    : 'SELECT * FROM reports WHERE by_email = ?';

  db.all(query, admin ? sc.params : [req.user.email], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch reports' });

    // How many unresolved reports share the same category + place
    const open = {};
    const key = (r) => r.cat + '|' + (r.loc || '');
    if (admin) rows.forEach((r) => { if (r.status !== 'done') open[key(r)] = (open[key(r)] || 0) + 1; });

    const formatted = rows.map((r) => {
      const similar = admin && r.status !== 'done' ? open[key(r)] : 0;
      return {
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
        at: r.at,
        shareTo: r.share_to || 'Admin',
        shareName: r.share_name || '',
        referTo: r.refer_to || '',
        similar,
        priority: !similar ? '' : similar >= 4 ? 'high' : similar >= 2 ? 'med' : 'low'
      };
    });

    formatted.sort((a, b) => admin
      ? ((a.status === 'done') - (b.status === 'done')) || (b.similar - a.similar) ||
        (a.status === 'done' ? b.at - a.at : a.at - b.at)
      : b.at - a.at);

    res.json(formatted);
  });
});

// Create Report
app.post('/api/reports', authenticateToken, (req, res) => {
  const { photo, desc, cat, loc, geo, term, shareTo, shareName, referTo } = req.body;

  if (!photo || !desc) {
    return res.status(400).json({ error: 'Photo and description are required.' });
  }

  // Who the report is shared with (Professor and Other need a name)
  const to = SHARE_OPTIONS.includes(shareTo) ? shareTo : 'Admin';
  const name = String(shareName || '').trim().slice(0, 80);
  if (to === 'Professor' && !name) return res.status(400).json({ error: "Enter the professor's name." });
  if (to === 'Other' && !name) return res.status(400).json({ error: 'Enter who this should be shared with.' });
  const storedName = ['Professor', 'Hostel warden', 'Other'].includes(to) ? name : '';

  const save = (adminEmail) => {
    const at = Date.now();
    const query = `INSERT INTO reports (by_email, by_name, photo, desc, cat, loc, geo, status, term, at, share_to, share_name, refer_to) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`;
    db.run(query, [req.user.email, req.user.name, photo, desc, cat, loc, geo, term, at, to, storedName, adminEmail], function (err) {
      if (err) return res.status(500).json({ error: 'Failed to save report' });
      res.json({ id: this.lastID, message: 'Report created successfully' });
    });
  };

  // Optional: send the report to one specific admin account
  const refer = String(referTo || '').trim().toLowerCase();
  if (!refer) return save('');
  db.get("SELECT email FROM users WHERE email = ? AND role = 'admin'", [refer], (err, a) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!a) return res.status(400).json({ error: 'No admin account found with that email.' });
    save(a.email);
  });
});

// Update Report Status (only the admin the report was sent to)
app.patch('/api/reports/:id/status', authenticateToken, adminOnly, (req, res) => {
  const { status } = req.body;
  const sc = scope(req.user);
  db.run(`UPDATE reports SET status = ? WHERE id = ? AND ${sc.sql}`, [status, req.params.id, ...sc.params], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update status' });
    if (!this.changes) return res.status(404).json({ error: 'Report not found' });
    res.json({ message: 'Status updated successfully' });
  });
});

// Delete a false / misleading report (only the admin the report was sent to)
app.delete('/api/reports/:id', authenticateToken, adminOnly, (req, res) => {
  const sc = scope(req.user);
  db.run(`DELETE FROM reports WHERE id = ? AND ${sc.sql}`, [req.params.id, ...sc.params], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete report' });
    if (!this.changes) return res.status(404).json({ error: 'Report not found' });
    res.json({ message: 'Report deleted' });
  });
});

// ---------------- ADMIN: BAN / UNBAN ----------------

const setBan = (value) => (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  db.run("UPDATE users SET banned = ? WHERE email = ? AND role = 'user'", [value, email], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!this.changes) return res.status(404).json({ error: 'User not found' });
    res.json({ message: value ? 'User banned' : 'User unbanned' });
  });
};
app.post('/api/admin/users/ban', authenticateToken, adminOnly, setBan(1));
app.post('/api/admin/users/unban', authenticateToken, adminOnly, setBan(0));

app.get('/api/admin/banned', authenticateToken, adminOnly, (req, res) => {
  db.all('SELECT id, name, email FROM users WHERE banned = 1 ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// ---------------- ADMIN: DASHBOARD STATS (only this admin's reports) ----------------

app.get('/api/admin/stats', authenticateToken, adminOnly, (req, res) => {
  const AREA = `CASE WHEN loc IS NULL OR loc = '' THEN 'Not specified' ELSE substr(loc, 1, instr(loc || ' › ', ' › ') - 1) END`;
  const PLACE = `COALESCE(NULLIF(loc, ''), 'Not specified')`;
  const sc = scope(req.user);
  const W = `WHERE ${sc.sql}`;
  const q = (sql) => new Promise((ok, no) => db.all(sql, sc.params, (e, r) => (e ? no(e) : ok(r))));

  Promise.all([
    q(`SELECT cat AS name, COUNT(*) AS count FROM reports ${W} GROUP BY cat ORDER BY count DESC`),
    q(`SELECT ${AREA} AS name, COUNT(*) AS count FROM reports ${W} GROUP BY 1 ORDER BY count DESC`),
    q(`SELECT cat, ${PLACE} AS place, COUNT(*) AS total, SUM(status != 'done') AS open
       FROM reports ${W} GROUP BY cat, place HAVING open > 0 ORDER BY open DESC, total DESC LIMIT 6`)
  ])
    .then(([cat, area, hot]) => res.json({ cat, area, hot }))
    .catch(() => res.status(500).json({ error: 'Failed to load stats' }));
});

// ---------------- PROFILE UPDATE (student asks, admin finalises) ----------------

app.get('/api/profile/request', authenticateToken, (req, res) => {
  db.get('SELECT name, sem, phone, contact, status FROM profile_requests WHERE user_id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(row || null);
  });
});

app.post('/api/profile/request', authenticateToken, (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot use this.' });
  const problem = validProfile(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const { name, sem, phone, contact } = req.body;
  db.run(
    `INSERT OR REPLACE INTO profile_requests (user_id, name, sem, phone, contact, status, at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [req.user.id, String(name).trim(), +sem, phone.trim(), contact.trim(), Date.now()],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to send request' });
      res.json({ message: 'Request sent to admin' });
    }
  );
});

app.get('/api/admin/profile-requests', authenticateToken, adminOnly, (req, res) => {
  db.all(
    `SELECT p.user_id, p.name, p.sem, p.phone, p.contact, p.at, u.email,
            u.name AS old_name, u.sem AS old_sem, u.sem_term, u.phone AS old_phone, u.contact AS old_contact
     FROM profile_requests p JOIN users u ON u.id = p.user_id
     WHERE p.status = 'pending' ORDER BY p.at`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows.map((r) => ({ ...r, old_sem: currentSem({ role: 'user', sem: r.old_sem, sem_term: r.sem_term }) })));
    }
  );
});

app.post('/api/admin/profile-requests/:uid/approve', authenticateToken, adminOnly, (req, res) => {
  db.get("SELECT * FROM profile_requests WHERE user_id = ? AND status = 'pending'", [req.params.uid], (err, p) => {
    if (err || !p) return res.status(404).json({ error: 'Request not found' });
    db.run(
      'UPDATE users SET name = ?, sem = ?, sem_term = ?, phone = ?, contact = ? WHERE id = ?',
      [p.name, p.sem, termNow(), p.phone, p.contact, p.user_id],
      (e) => {
        if (e) return res.status(500).json({ error: 'Failed to update profile' });
        db.run('DELETE FROM profile_requests WHERE user_id = ?', [p.user_id]);
        res.json({ message: 'Profile updated' });
      }
    );
  });
});

app.post('/api/admin/profile-requests/:uid/reject', authenticateToken, adminOnly, (req, res) => {
  db.run("UPDATE profile_requests SET status = 'rejected' WHERE user_id = ?", [req.params.uid], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ message: 'Request rejected' });
  });
});

app.listen(PORT, () => {
  console.log(`FixTrack server running at http://localhost:${PORT}`);
});