/* ====== EDIT THIS: paste your Google Form link ====== */
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdexGijakEXNoQblei7UYJ6iNodMlbaPDLHE4meOreM-pSEIA/viewform?usp=dialog';
const $ = id => document.getElementById(id);
$('feedbackLink').href = FEEDBACK_URL;

let me = null, token = localStorage.getItem('ft_token'), role = 'user', mode = 'login', photoData = '', geo = null, reports = [];
let pending = null, stats = { cat: [], area: [], hot: [] }, reqs = [], banned = [], fCat = '', fStat = '', fLoc = '', fShare = '';

const CATS = ['Electrical', 'Network', 'Bathroom', 'Room', 'Furniture', 'Others'];
const SHARE = ['Admin', 'Dean', 'Registrar', 'Professor', 'Hostel warden', 'Other'];
const NAME_HINT = {
  'Professor': "Professor's name (required)",
  'Hostel warden': "Warden's name (optional)",
  'Other': 'Who should get this? (required)'
};
const LOCS = {
  'Academic Block': {
    'Block I': ['Room', 'Lab', 'No.', 'Bathroom'],
    'Block II': ['Room', 'Lab', 'Bathroom'],
    'Block III': ['Room', 'Lab', 'Bathroom'],
    'Block IV': ['Room', 'Lab', 'Bathroom']
  },
  'Library': ['Room', 'Bathroom'],
  'Fields / Sport Area': ['Football', 'Volleyball', 'Cricket'],
  'Hostel': ['Papum', 'Lohit-1', 'Lohit-2', 'Subhanshree']
};
const STAT = { new: 'Reported', proc: 'Under process', done: 'Solved' };
const PRI = { high: 'High priority', med: 'Medium priority', low: 'Low priority' };

// Demo logins: [tab, email, password]
const DEMOS = {
  user: ['user', 'student@college.edu', 'student123'],
  admin: ['admin', 'admin@college.edu', 'admin123'],
  dean: ['admin', 'dean@college.edu', 'dean123'],
  registrar: ['admin', 'registrar@college.edu', 'registrar123'],
  warden: ['admin', 'warden@college.edu', 'warden123']
};

const semNow = () => {
  const d = new Date();
  return d.getFullYear() + (d.getMonth() < 6 ? ' Spring' : ' Autumn');
};

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (el, arr, ph) => { el.innerHTML = (ph ? `<option value="">${ph}</option>` : '') + arr.map(a => `<option>${esc(a)}</option>`).join('') };
const api = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
});

/* Setup Tabs */
fill($('fSem'), [1, 2, 3, 4, 5, 6, 7, 8]);
fill($('pSem'), [1, 2, 3, 4, 5, 6, 7, 8]);
fill($('fCatSel'), CATS, 'All categories');
fill($('fShareSel'), SHARE, 'Shared with: anyone');
fill($('shareTo'), SHARE);
document.querySelectorAll('#roleTabs button').forEach(b => b.onclick = () => { role = b.dataset.r; tab('roleTabs', b); setAuth() });
document.querySelectorAll('#modeTabs button').forEach(b => b.onclick = () => { mode = b.dataset.m; tab('modeTabs', b); setAuth() });

function tab(id, b) { document.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b)) }

function setAuth() {
  const su = mode === 'signup' && role === 'user';
  $('signupOnly').classList.toggle('hidden', !su);
  $('modeTabs').classList.toggle('hidden', role === 'admin');
  if (role === 'admin') mode = 'login';
  $('authBtn').textContent = mode === 'signup' && role === 'user' ? 'Create account' : (role === 'admin' ? 'Admin sign in' : 'Log in');
  $('authMsg').textContent = '';
}

const msg = (t, ok) => { const m = $('authMsg'); m.textContent = t; m.className = 'msg' + (ok ? ' ok' : '') };

/* Authentication API Calls */
$('authBtn').onclick = async () => {
  const email = $('fEmail').value.trim().toLowerCase(), pass = $('fPass').value;
  if (!email || !pass) return msg('Enter your college email and password.');

  if (mode === 'signup' && role === 'user') {
    const name = $('fName').value.trim(), phone = $('fPhone').value.trim(), contact = $('fContact').value.trim();
    if (!name) return msg('Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.(edu|ac\.in|edu\.in)$/.test(email)) return msg('Use your college email (ending in .edu or .ac.in).');
    if (pass.length < 6) return msg('Password needs at least 6 characters.');
    if (!/^[0-9+\-\s]{8,15}$/.test(phone)) return msg('Enter a valid phone number.');
    if (!/^\S+@\S+\.\S+$/.test(contact)) return msg('Enter a valid contact email.');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, pass, sem: +$('fSem').value, phone, contact })
      });
      const data = await res.json();
      if (!res.ok) return msg(data.error);
      token = data.token;
      localStorage.setItem('ft_token', token);
      me = data.user;
      loadAppData();
    } catch (e) { msg('Server error. Try again.'); }
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pass, role })
    });
    const data = await res.json();
    if (!res.ok) return msg(data.error); // also shows "Your account has been banned by the admin."
    token = data.token;
    localStorage.setItem('ft_token', token);
    me = data.user;
    loadAppData();
  } catch (e) { msg('Server connection failed.'); }
};

$('logout').onclick = () => {
  me = null; token = null; localStorage.removeItem('ft_token');
  $('menu').classList.add('hidden'); $('app').classList.add('hidden'); $('auth').classList.remove('hidden'); $('fPass').value = '';
};

/* Load Application State & Reports from API */
async function loadAppData() {
  try {
    const res = await api('/api/reports');
    if (res.status === 401 || res.status === 403) {
      const d = await res.json().catch(() => ({}));
      $('logout').click();
      msg(d.error || 'Please log in again.');
      return;
    }
    reports = await res.json();

    if (me.role === 'admin') {
      const [s, q, b] = await Promise.all(
        ['/api/admin/stats', '/api/admin/profile-requests', '/api/admin/banned'].map(u => api(u).then(r => r.json()).catch(() => null))
      );
      if (s && s.cat) stats = s;
      reqs = Array.isArray(q) ? q : [];
      banned = Array.isArray(b) ? b : [];
    } else {
      pending = await api('/api/profile/request').then(r => r.json()).catch(() => null);
    }
    render();
  } catch (e) { console.error('Failed to load reports:', e); }
}

/* ---------- Admin helpers ---------- */
function syncFilters() {
  $('fCatSel').value = fCat;
  $('fStatSel').value = fStat;
  $('fShareSel').value = fShare;
  $('fLocTxt').textContent = fLoc ? 'Place: ' + fLoc : '';
  $('clearF').classList.toggle('hidden', !(fCat || fStat || fLoc || fShare));
}
$('fCatSel').onchange = () => { fCat = $('fCatSel').value; fLoc = ''; syncFilters(); render(); };
$('fStatSel').onchange = () => { fStat = $('fStatSel').value; syncFilters(); render(); };
$('fShareSel').onchange = () => { fShare = $('fShareSel').value; syncFilters(); render(); };
$('clearF').onclick = () => { fCat = ''; fStat = ''; fLoc = ''; fShare = ''; syncFilters(); render(); };

$('barCat').onclick = e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  fCat = b.dataset.cat; fLoc = ''; fStat = ''; syncFilters(); render();
  $('listTitle').scrollIntoView({ behavior: 'smooth' });
};
$('hot').onclick = e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  fCat = b.dataset.cat; fLoc = b.dataset.loc; fStat = ''; syncFilters(); render();
  $('listTitle').scrollIntoView({ behavior: 'smooth' });
};
$('reqList').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    await api(`/api/admin/profile-requests/${b.dataset.uid}/${b.dataset.act}`, { method: 'POST' });
    loadAppData();
  } catch (err) { alert('Could not update the request.'); }
};
$('banList').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    await api('/api/admin/users/unban', { method: 'POST', body: JSON.stringify({ email: b.dataset.email }) });
    loadAppData();
  } catch (err) { alert('Could not unban the user.'); }
};

function bars(el, rows, clickable) {
  const max = Math.max(1, ...rows.map(r => r.count));
  el.innerHTML = rows.length ? rows.map(r =>
    `<${clickable ? 'button type="button" data-cat="' + esc(r.name) + '"' : 'div'} class="bar"><span class="bl">${esc(r.name)}</span><span class="bt"><i style="width:${(r.count / max * 100).toFixed(0)}%"></i></span><b>${r.count}</b></${clickable ? 'button' : 'div'}>`
  ).join('') : '<div class="empty">No reports yet.</div>';
}

function renderAdmin() {
  $('hot').innerHTML = stats.hot.length ? stats.hot.map((h, i) =>
    `<button class="hotItem" type="button" data-cat="${esc(h.cat)}" data-loc="${esc(h.place)}"><b>#${i + 1}</b><span>${esc(h.cat)} · ${esc(h.place)}</span><em>${h.open} open of ${h.total}</em></button>`
  ).join('') : '<div class="empty">No open problems. Nice.</div>';
  bars($('barCat'), stats.cat, true);
  bars($('barArea'), stats.area, false);

  const diff = (l, a, b) => `<p>${l}: ${esc(a)} → <b>${esc(b)}</b></p>`;
  $('reqList').innerHTML = reqs.length ? reqs.map(q => `<article class="req"><div>
      <h3>${esc(q.email)}</h3>
      ${diff('Name', q.old_name, q.name)}${diff('Semester', q.old_sem, q.sem)}${diff('Phone', q.old_phone || '-', q.phone || '-')}${diff('Contact', q.old_contact || '-', q.contact || '-')}
    </div><p class="acts"><button class="mini" data-act="approve" data-uid="${q.user_id}">Approve</button><button class="mini danger" data-act="reject" data-uid="${q.user_id}">Reject</button></p></article>`
  ).join('') : '<div class="empty">No pending profile requests.</div>';

  $('banList').innerHTML = banned.length ? banned.map(u => `<article class="req"><div><h3>${esc(u.name)}</h3><p>${esc(u.email)}</p></div>
    <p class="acts"><button class="mini" data-email="${esc(u.email)}">Unban</button></p></article>`
  ).join('') : '<div class="empty">No banned users.</div>';
}

function itemHtml(r, admin) {
  const meta = new Date(r.at).toLocaleDateString()
    + (admin ? ' · ' + esc(r.byName) + ' (' + esc(r.by) + ')' : '')
    + (r.geo ? ` · <a href="https://www.google.com/maps?q=${esc(r.geo)}" target="_blank" rel="noopener">map</a>` : '');
  const tags = [];
  if (r.shareTo && r.shareTo !== 'Admin') tags.push('Shared with: ' + r.shareTo + (r.shareName ? ' (' + r.shareName + ')' : ''));
  if (!admin && r.referTo) tags.push('Sent to: ' + r.referTo);
  const share = tags.length ? `<p>${tags.map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>` : '';
  const pri = admin && r.status !== 'done'
    ? `<p><span class="pri p-${esc(r.priority)}">${PRI[r.priority] || ''}</span>${r.similar > 1 ? ' · ' + r.similar + ' similar open reports' : ''}</p>` : '';
  const ctrl = admin
    ? `<select data-id="${r.id}" aria-label="Status">
        <option value="new"${r.status === 'new' ? ' selected' : ''}>Reported</option>
        <option value="proc"${r.status === 'proc' ? ' selected' : ''}>Under process</option>
        <option value="done"${r.status === 'done' ? ' selected' : ''}>Solved</option>
      </select>
      <p class="acts"><button class="mini" type="button" data-del="${r.id}">Delete</button><button class="mini danger" type="button" data-ban="${r.id}" data-email="${esc(r.by)}">Delete &amp; ban user</button></p>`
    : `<span class="badge b-${r.status}">${STAT[r.status]}</span>`;
  return `<article class="item"><img src="${esc(r.photo)}" alt="Issue photo"><div>
    <h3>${esc(r.cat)}${r.loc ? ' · ' + esc(r.loc) : ''}</h3><p>${esc(r.desc)}</p>
    <p>${meta}</p>${share}${pri}${ctrl}</div></article>`;
}

function render() {
  $('auth').classList.add('hidden'); $('app').classList.remove('hidden'); $('avBtn').textContent = me.name.trim()[0].toUpperCase();
  const rows = me.role === 'admin'
    ? [['Name', me.name], ['Role', 'Administrator'], ['Email', me.email]]
    : [['Name', me.name], ['College email', me.email], ['Semester', me.sem + ' of 8'], ['Contact', me.contact + (me.phone ? ' · ' + me.phone : '')]];
  $('info').innerHTML = rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('');

  const cur = reports.filter(r => r.term === semNow());
  $('semLabel').textContent = 'Counts for ' + semNow() + ' term. They restart every semester.';
  $('cNew').textContent = cur.filter(r => r.status === 'new').length;
  $('cProc').textContent = cur.filter(r => r.status === 'proc').length;
  $('cDone').textContent = cur.filter(r => r.status === 'done').length;

  const admin = me.role === 'admin';
  $('plus').closest('.hero').classList.toggle('hidden', admin);
  $('howto').classList.toggle('hidden', admin);
  $('editProfile').classList.toggle('hidden', admin);
  $('adminPanel').classList.toggle('hidden', !admin);
  $('filters').classList.toggle('hidden', !admin);
  $('listTitle').textContent = admin ? 'Reports sent to you (highest priority first)' : 'My reports';
  if (admin) { renderAdmin(); syncFilters(); }

  const shown = admin
    ? reports.filter(r => (!fCat || r.cat === fCat) && (!fStat || r.status === fStat) && (!fShare || r.shareTo === fShare) && (!fLoc || (r.loc || 'Not specified') === fLoc))
    : reports;

  $('list').innerHTML = shown.length ? shown.map(r => itemHtml(r, admin)).join('')
    : '<div class="empty">' + (admin ? (reports.length ? 'No reports match this filter.' : 'No reports sent to you yet.') : 'You have not reported anything yet. Press + to report your first issue.') + '</div>';

  document.querySelectorAll('.item select').forEach(s => s.onchange = async () => {
    try {
      await api(`/api/reports/${s.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: s.value }) });
      loadAppData();
    } catch (e) { alert('Failed to update status'); }
  });

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this report?')) return;
    try { await api(`/api/reports/${b.dataset.del}`, { method: 'DELETE' }); loadAppData(); }
    catch (e) { alert('Failed to delete report'); }
  });

  document.querySelectorAll('[data-ban]').forEach(b => b.onclick = async () => {
    if (!confirm(`Delete this report and ban ${b.dataset.email}? They will no longer be able to log in.`)) return;
    try {
      await api('/api/admin/users/ban', { method: 'POST', body: JSON.stringify({ email: b.dataset.email }) });
      await api(`/api/reports/${b.dataset.ban}`, { method: 'DELETE' });
      loadAppData();
    } catch (e) { alert('Failed to ban user'); }
  });
}

$('avBtn').onclick = e => { e.stopPropagation(); const m = $('menu'); m.classList.toggle('hidden'); $('avBtn').setAttribute('aria-expanded', !m.classList.contains('hidden')) };
document.addEventListener('click', e => { if (!e.target.closest('.profile')) $('menu').classList.add('hidden') });
$('themeBtn').onclick = () => { const d = document.documentElement, dark = d.dataset.theme ? d.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches; d.dataset.theme = dark ? 'light' : 'dark' };

/* Report Modal Setup */
fill($('cat'), CATS); fill($('loc1'), Object.keys(LOCS), 'Select area');
$('loc1').onchange = () => {
  const v = LOCS[$('loc1').value], a = $('loc2'), b = $('loc3');
  a.classList.add('hidden'); b.classList.add('hidden');
  if (!v) return;
  if (Array.isArray(v)) { fill(a, v, 'Select place'); a.classList.remove('hidden') }
  else { fill(a, Object.keys(v), 'Select block'); a.classList.remove('hidden') }
};
$('loc2').onchange = () => { const v = LOCS[$('loc1').value]; if (Array.isArray(v)) return; const s = v[$('loc2').value]; if (s) { fill($('loc3'), s, 'Select spot'); $('loc3').classList.remove('hidden') } else $('loc3').classList.add('hidden') };

/* "Share this with" - shows a name box for Professor, Hostel warden and Other */
$('shareTo').onchange = () => {
  const hint = NAME_HINT[$('shareTo').value], n = $('shareName');
  n.classList.toggle('hidden', !hint);
  n.placeholder = hint || '';
  if (!hint) n.value = '';
};

$('plus').onclick = () => { $('ov').classList.remove('hidden'); $('rMsg').textContent = '' };
const closeM = () => { $('ov').classList.add('hidden') };
$('mx').onclick = closeM; $('ov').onclick = e => { if (e.target === $('ov')) closeM() };

/* Profile edit modal (changes go to admin for approval) */
const closeP = () => { $('pov').classList.add('hidden') };
$('px').onclick = closeP; $('pov').onclick = e => { if (e.target === $('pov')) closeP() };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeM(); closeP() } });

$('editProfile').onclick = () => {
  $('menu').classList.add('hidden');
  const p = pending && pending.status === 'pending' ? pending : me;
  $('pName').value = p.name; $('pSem').value = p.sem; $('pPhone').value = p.phone || ''; $('pContact').value = p.contact || '';
  $('pNote').textContent = pending
    ? (pending.status === 'pending' ? 'You already have a request waiting for the admin. Sending again replaces it.' : 'Your last request was rejected by the admin. You can send a new one.')
    : 'Your changes are applied only after the admin approves them.';
  $('pMsg').textContent = ''; $('pMsg').className = 'msg';
  $('pov').classList.remove('hidden');
};

$('pSubmit').onclick = async () => {
  const m = $('pMsg'); m.className = 'msg';
  const body = { name: $('pName').value.trim(), sem: +$('pSem').value, phone: $('pPhone').value.trim(), contact: $('pContact').value.trim() };
  if (!body.name) return m.textContent = 'Enter your name.';
  if (!/^[0-9+\-\s]{8,15}$/.test(body.phone)) return m.textContent = 'Enter a valid phone number.';
  if (!/^\S+@\S+\.\S+$/.test(body.contact)) return m.textContent = 'Enter a valid contact email.';
  try {
    const res = await api('/api/profile/request', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return m.textContent = data.error || 'Could not send request';
    pending = { ...body, status: 'pending' };
    m.className = 'msg ok'; m.textContent = 'Sent. Your changes apply once the admin approves them.';
  } catch (e) { m.textContent = 'Server connection error.'; }
};

$('photo').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image, url = URL.createObjectURL(f);
  img.onload = () => {
    const s = Math.min(1, 480 / img.width), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); photoData = c.toDataURL('image/jpeg', .6);
    $('prev').src = photoData; $('prev').classList.remove('hidden'); $('dropTxt').textContent = 'Photo added. Tap to change.'; URL.revokeObjectURL(url);
  };
  img.src = url;
};

$('geo').onclick = () => {
  if (!navigator.geolocation) { $('geoTxt').textContent = 'Location is not supported on this device.'; return }
  $('geoTxt').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(p => { geo = p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5); $('geoTxt').textContent = 'Location saved: ' + geo },
    () => { $('geoTxt').textContent = 'Could not get location. Allow location access or pick an area above.' }, { enableHighAccuracy: true, timeout: 10000 });
};

$('submit').onclick = async () => {
  const m = $('rMsg'); m.className = 'msg';
  if (!photoData) return m.textContent = 'Add a photo of the problem.';
  const desc = $('desc').value.trim(); if (!desc) return m.textContent = 'Describe the problem.';
  const shareTo = $('shareTo').value, shareName = $('shareName').value.trim();
  if (shareTo === 'Professor' && !shareName) return m.textContent = "Enter the professor's name.";
  if (shareTo === 'Other' && !shareName) return m.textContent = 'Enter who this should be shared with.';
  const referTo = $('referTo').value.trim().toLowerCase();
  if (referTo && !/^\S+@\S+\.\S+$/.test(referTo)) return m.textContent = 'Enter a valid admin email, or leave it empty.';
  const loc = [$('loc1').value, $('loc2').value, $('loc3').value].filter(Boolean).join(' › ');

  try {
    const res = await api('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ photo: photoData, desc, cat: $('cat').value, loc, geo, term: semNow(), shareTo, shareName, referTo })
    });
    const data = await res.json();
    if (!res.ok) return m.textContent = data.error || 'Failed to submit report';

    photoData = ''; geo = null; $('photo').value = ''; $('desc').value = ''; $('prev').classList.add('hidden'); $('dropTxt').textContent = 'Tap to take or upload a photo'; $('loc1').value = ''; $('loc1').onchange(); $('geoTxt').textContent = '';
    $('shareTo').value = 'Admin'; $('shareTo').onchange(); $('referTo').value = '';
    closeM();
    loadAppData();
  } catch (e) { m.textContent = 'Server connection error.'; }
};

document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => {
  const [r, em, pw] = DEMOS[b.dataset.demo];
  role = r; mode = 'login';
  tab('roleTabs', document.querySelector('#roleTabs [data-r="' + role + '"]'));
  tab('modeTabs', document.querySelector('#modeTabs [data-m="login"]'));
  $('fEmail').value = em;
  $('fPass').value = pw;
  setAuth();
});

// Auto login if token exists
if (token) {
  fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json())
    .then(data => {
      if (data.user) { me = data.user; loadAppData(); }
      else { localStorage.removeItem('ft_token'); setAuth(); if (data.error) msg(data.error); }
    })
    .catch(() => setAuth());
} else {
  setAuth();
}