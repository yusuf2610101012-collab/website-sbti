import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import db, { DEFAULT_ASPEK, DEFAULT_WILAYAH_TREE, SABUK_LIST } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

// CORS headers agar bisa diakses dari frontend terpisah maupun satu origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Helpers
const today = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
const str = (x, n = 200) => String(x ?? '').slice(0, n);
const newId = p => p + Date.now().toString(36) + randomBytes(3).toString('hex');
const validSabuk = s => SABUK_LIST.includes(s) ? s : 'Putih';

const hash = p => {
  const s = randomBytes(16).toString('hex');
  return s + ':' + scryptSync(p, s, 32).toString('hex');
};

const check = (p, h) => {
  const [s, x] = String(h || '').split(':');
  if (!s || !x) return false;
  const a = Buffer.from(scryptSync(p, s, 32).toString('hex'));
  const b = Buffer.from(x);
  return a.length === b.length && timingSafeEqual(a, b);
};

const getMeta = k => db.prepare('SELECT value FROM sys_meta WHERE key = ?').get(k)?.value || null;
const setMeta = (k, v) => db.prepare('INSERT INTO sys_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let x = getMeta('secret');
  if (!x) {
    x = randomBytes(32).toString('hex');
    setMeta('secret', x);
  }
  return x;
}

function sign(payload) {
  const b = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 6048e5 })).toString('base64url');
  return b + '.' + createHmac('sha256', getSecret()).update(b).digest('base64url');
}

function who(req) {
  const [b, s] = (req.headers.authorization || '').replace('Bearer ', '').split('.');
  if (!b || !s) return null;
  const e = createHmac('sha256', getSecret()).update(b).digest('base64url');
  if (e.length !== s.length || !timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

const adminReady = () => !!process.env.ADMIN_PASSWORD || !!getMeta('admin');
const adminOK = pw => process.env.ADMIN_PASSWORD ? pw === process.env.ADMIN_PASSWORD : check(pw, getMeta('admin'));
const tok = (res, role, uid) => res.json({ token: sign({ role, uid }), role, uid });

function getCfgMain() {
  const row = db.prepare('SELECT * FROM cfg_main WHERE id = 1').get();
  let site = {}, aspek = DEFAULT_ASPEK, wilayahTree = DEFAULT_WILAYAH_TREE;
  try { site = JSON.parse(row?.site_json || '{}'); } catch {}
  try {
    const parsed = JSON.parse(row?.aspek_json || '[]');
    if (Array.isArray(parsed) && parsed.length) aspek = parsed;
  } catch {}
  try {
    const parsedTree = JSON.parse(row?.wilayah_tree_json || '[]');
    if (Array.isArray(parsedTree)) wilayahTree = parsedTree;
  } catch {}
  return { kode: row?.kode || '', site, aspek, wilayahTree, sabukList: SABUK_LIST };
}

// ================= PUBLIC ROUTES =================

app.get('/api/public', (req, res) => {
  const c = getCfgMain();
  res.json({
    site: c.site,
    adminReady: adminReady(),
    wilayahTree: c.wilayahTree,
    sabukList: SABUK_LIST
  });
});

app.post('/api/setup-admin', (req, res) => {
  if (adminReady()) return res.status(403).json({ error: 'Admin sudah dibuat' });
  const pw = str(req.body.password, 100);
  if (pw.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  setMeta('admin', hash(pw));
  tok(res, 'admin', 'admin');
});

app.post('/api/login', (req, res) => {
  const b = req.body || {};
  if (b.role === 'admin') {
    if (!adminReady() || !adminOK(str(b.password, 100))) {
      return res.status(401).json({ error: 'Password admin salah' });
    }
    return tok(res, 'admin', 'admin');
  }
  if (b.role === 'pelatih') {
    const c = getCfgMain();
    const n = str(b.nama, 60).trim();
    if (!c.kode || b.kode !== c.kode || !n) {
      return res.status(401).json({ error: 'Nama kosong atau kode akses salah' });
    }
    let staff = db.prepare('SELECT * FROM staff WHERE LOWER(nama) = LOWER(?)').get(n);
    if (!staff) {
      const id = newId('t');
      db.prepare('INSERT INTO staff (id, nama, role, wilayah, cabang, unit_latihan) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, n, 'pelatih', str(b.wilayah, 80), str(b.cabang, 80), str(b.unit_latihan, 80));
      staff = { id };
    }
    return tok(res, 'pelatih', staff.id);
  }
  if (b.role === 'murid') {
    const n = str(b.nama, 60).trim();
    const m = db.prepare('SELECT * FROM murid WHERE LOWER(nama) = LOWER(?)').get(n);
    if (!m || !check(str(b.password, 100), m.ph)) {
      return res.status(401).json({ error: 'Nama atau kata sandi salah' });
    }
    if (!m.aktif) {
      return res.status(403).json({ error: 'Akun nonaktif, hubungi pengurus' });
    }
    return tok(res, 'murid', m.id);
  }
  res.status(400).json({ error: 'Peran tidak dikenal' });
});

app.post('/api/register', (req, res) => {
  const b = req.body || {};
  const n = str(b.nama, 60).trim();
  const p = str(b.password, 100);
  if (!n || p.length < 4) {
    return res.status(400).json({ error: 'Isi nama dan kata sandi (min. 4 karakter)' });
  }
  const exists = db.prepare('SELECT id FROM murid WHERE LOWER(nama) = LOWER(?)').get(n);
  if (exists) {
    return res.status(400).json({ error: 'Nama sudah terdaftar, silakan masuk' });
  }
  const rows = db.prepare('SELECT noAnggota FROM murid').all();
  const maxNo = rows.reduce((x, r) => Math.max(x, parseInt(String(r.noAnggota).replace(/\D/g, '')) || 0), 0);
  const noAnggota = 'SBTI-' + String(maxNo + 1).padStart(3, '0');
  const id = newId('m');

  db.prepare(`
    INSERT INTO murid (id, nama, noAnggota, jk, telp, sabuk, wilayah, cabang, unit_latihan, tglGabung, aktif, ph)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    n,
    noAnggota,
    b.jk === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
    str(b.telp, 30),
    validSabuk(b.sabuk),
    str(b.wilayah, 80).trim(),
    str(b.cabang, 80).trim(),
    str(b.unit_latihan, 80).trim(),
    today(),
    hash(p)
  );
  tok(res, 'murid', id);
});

// ================= PROTECTED ROUTES =================

app.use('/api', (req, res, next) => {
  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Sesi berakhir, silakan masuk lagi' });
  req.me = me;
  next();
});

app.get('/api/me', (req, res) => {
  const { role, uid } = req.me;
  if (role === 'murid') {
    const m = db.prepare('SELECT id FROM murid WHERE id = ?').get(uid);
    if (!m) return res.status(401).json({ error: 'Akun tidak ditemukan' });
  }
  res.json({ role, uid });
});

app.get('/api/data', (req, res) => {
  const { role, uid } = req.me;
  const isAdmin = role === 'admin';
  const isStaff = isAdmin || role === 'pelatih';

  const out = { murid: {}, staff: {}, sesi: {}, absen: {}, nilai: {}, cfg: {} };

  const muridRows = isStaff
    ? db.prepare('SELECT id, nama, noAnggota, jk, telp, sabuk, wilayah, cabang, unit_latihan, tglGabung, aktif FROM murid').all()
    : db.prepare('SELECT id, nama, noAnggota, jk, telp, sabuk, wilayah, cabang, unit_latihan, tglGabung, aktif FROM murid WHERE id = ?').all(uid);

  if (!isStaff && muridRows.length === 0) {
    return res.status(401).json({ error: 'Akun tidak ditemukan' });
  }
  for (const m of muridRows) {
    out.murid[m.id] = { ...m, aktif: Boolean(m.aktif) };
  }

  if (isAdmin) {
    for (const s of db.prepare('SELECT * FROM staff').all()) out.staff[s.id] = s;
  } else if (role === 'pelatih') {
    const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(uid);
    if (s) out.staff[uid] = s;
  }

  for (const s of db.prepare('SELECT * FROM sesi').all()) {
    out.sesi[s.id] = s;
  }

  const absenRows = isStaff
    ? db.prepare('SELECT * FROM absen').all()
    : db.prepare('SELECT * FROM absen WHERE murid_id = ?').all(uid);
  for (const a of absenRows) {
    out.absen[`${a.sesi_id}_${a.murid_id}`] = { sesi: a.sesi_id, uid: a.murid_id, status: a.status };
  }

  const nilaiRows = isStaff
    ? db.prepare('SELECT * FROM nilai').all()
    : db.prepare('SELECT * FROM nilai WHERE murid_id = ?').all(uid);
  for (const n of nilaiRows) {
    let skor = {};
    try { skor = JSON.parse(n.skor_json || '{}'); } catch {}
    out.nilai[`${n.sesi_id}_${n.murid_id}`] = {
      sesi: n.sesi_id,
      uid: n.murid_id,
      skor,
      catatan: n.catatan,
      oleh: n.oleh
    };
  }

  const c = getCfgMain();
  out.cfg.main = isAdmin
    ? c
    : { aspek: c.aspek, site: c.site, wilayahTree: c.wilayahTree, sabukList: SABUK_LIST };

  res.json({ S: out });
});

app.post('/api/admin-password', (req, res) => {
  if (req.me.role !== 'admin') return res.status(403).json({ error: 'Tidak diizinkan' });
  if (process.env.ADMIN_PASSWORD) {
    return res.status(400).json({ error: 'Password diatur lewat variabel ADMIN_PASSWORD di server' });
  }
  const pw = str(req.body.password, 100);
  if (pw.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  setMeta('admin', hash(pw));
  res.json({ ok: 1 });
});

app.post('/api/set', (req, res) => {
  const { role, uid } = req.me;
  const isAdmin = role === 'admin';
  const isStaff = isAdmin || role === 'pelatih';

  const [col, key] = str(req.body.path, 120).split('/');
  const d = req.body.data && typeof req.body.data === 'object' ? req.body.data : {};

  if (!key || !/^[\w-]+$/.test(key.replace('_', '-'))) {
    return res.status(400).json({ error: 'Path tidak valid' });
  }

  if (col === 'absen') {
    const [sid, u] = key.split('_');
    const s = db.prepare('SELECT * FROM sesi WHERE id = ?').get(sid);
    const status = str(d.status, 10);
    if (!s || !u) return res.status(404).json({ error: 'Latihan tidak ditemukan' });

    if (role === 'murid') {
      if (u !== uid || !['hadir', 'izin', 'sakit'].includes(status)) {
        return res.status(403).json({ error: 'Tidak diizinkan' });
      }
      if (s.tgl !== today()) {
        return res.status(403).json({ error: 'Absen hanya dibuka pada hari latihan' });
      }
    } else if (!['hadir', 'izin', 'sakit', 'alpha'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid' });
    }

    db.prepare(`
      INSERT INTO absen (sesi_id, murid_id, status) VALUES (?, ?, ?)
      ON CONFLICT(sesi_id, murid_id) DO UPDATE SET status = excluded.status
    `).run(sid, u, status);
    return res.json({ ok: 1 });
  }

  if (!isStaff) return res.status(403).json({ error: 'Tidak diizinkan' });

  if (col === 'sesi') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(d.tgl)) || !str(d.materi).trim()) {
      return res.status(400).json({ error: 'Tanggal dan materi wajib diisi' });
    }
    db.prepare(`
      INSERT INTO sesi (id, tgl, materi, pelatih, wilayah, cabang, unit_latihan)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tgl = excluded.tgl,
        materi = excluded.materi,
        pelatih = excluded.pelatih,
        wilayah = excluded.wilayah,
        cabang = excluded.cabang,
        unit_latihan = excluded.unit_latihan
    `).run(
      key,
      d.tgl,
      str(d.materi, 200).trim(),
      str(d.pelatih, 60),
      str(d.wilayah, 80).trim(),
      str(d.cabang, 80).trim(),
      str(d.unit_latihan, 80).trim()
    );
    return res.json({ ok: 1 });
  }

  if (col === 'nilai') {
    const [sid, u] = key.split('_');
    if (!sid || !u) return res.status(400).json({ error: 'Path tidak valid' });
    const sk = {};
    for (const [k, x] of Object.entries(d.skor || {})) {
      const n = Number(x);
      if (Number.isFinite(n)) sk[str(k, 40)] = Math.min(100, Math.max(0, n));
    }
    db.prepare(`
      INSERT INTO nilai (sesi_id, murid_id, skor_json, catatan, oleh)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sesi_id, murid_id) DO UPDATE SET
        skor_json = excluded.skor_json,
        catatan = excluded.catatan,
        oleh = excluded.oleh
    `).run(sid, u, JSON.stringify(sk), str(d.catatan, 1000), str(d.oleh, 60));
    return res.json({ ok: 1 });
  }

  if (col === 'staff') {
    if (!isAdmin && key !== uid) return res.status(403).json({ error: 'Tidak diizinkan' });
    const e = db.prepare('SELECT * FROM staff WHERE id = ?').get(key);
    if (!e) return res.status(404).json({ error: 'Pelatih tidak ditemukan' });
    db.prepare('UPDATE staff SET nama = ?, wilayah = ?, cabang = ?, unit_latihan = ? WHERE id = ?')
      .run(
        str(d.nama, 60).trim() || e.nama,
        d.wilayah !== undefined ? str(d.wilayah, 80).trim() : e.wilayah,
        d.cabang !== undefined ? str(d.cabang, 80).trim() : e.cabang,
        d.unit_latihan !== undefined ? str(d.unit_latihan, 80).trim() : e.unit_latihan,
        key
      );
    return res.json({ ok: 1 });
  }

  if (!isAdmin) return res.status(403).json({ error: 'Tidak diizinkan' });

  if (col === 'murid') {
    if (!str(d.nama).trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
    const e = db.prepare('SELECT * FROM murid WHERE id = ?').get(key);
    if (e) {
      db.prepare(`
        UPDATE murid SET nama = ?, noAnggota = ?, jk = ?, telp = ?, sabuk = ?, wilayah = ?, cabang = ?, unit_latihan = ?, tglGabung = ?, aktif = ?
        WHERE id = ?
      `).run(
        str(d.nama, 60).trim(),
        str(d.noAnggota, 30),
        d.jk === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
        str(d.telp, 30),
        validSabuk(d.sabuk),
        str(d.wilayah, 80).trim(),
        str(d.cabang, 80).trim(),
        str(d.unit_latihan, 80).trim(),
        str(d.tglGabung, 10),
        d.aktif !== false ? 1 : 0,
        key
      );
    } else {
      db.prepare(`
        INSERT INTO murid (id, nama, noAnggota, jk, telp, sabuk, wilayah, cabang, unit_latihan, tglGabung, aktif, ph)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        key,
        str(d.nama, 60).trim(),
        str(d.noAnggota, 30),
        d.jk === 'Perempuan' ? 'Perempuan' : 'Laki-laki',
        str(d.telp, 30),
        validSabuk(d.sabuk),
        str(d.wilayah, 80).trim(),
        str(d.cabang, 80).trim(),
        str(d.unit_latihan, 80).trim(),
        str(d.tglGabung, 10) || today(),
        d.aktif !== false ? 1 : 0,
        hash('1234')
      );
    }
    return res.json({ ok: 1 });
  }

  if (col === 'cfg' && key === 'main') {
    const cur = getCfgMain();
    const kode = d.kode !== undefined ? str(d.kode, 60) : cur.kode;
    const site = d.site !== undefined ? d.site : cur.site;
    const aspek = d.aspek !== undefined ? d.aspek : cur.aspek;
    const wilayahTree = d.wilayahTree !== undefined ? d.wilayahTree : cur.wilayahTree;
    if (JSON.stringify({ kode, site, aspek, wilayahTree }).length > 6e5) {
      return res.status(400).json({ error: 'Data terlalu besar' });
    }
    db.prepare('UPDATE cfg_main SET kode = ?, site_json = ?, aspek_json = ?, wilayah_tree_json = ? WHERE id = 1')
      .run(kode, JSON.stringify(site), JSON.stringify(aspek), JSON.stringify(wilayahTree));
    return res.json({ ok: 1 });
  }

  res.status(403).json({ error: 'Tidak diizinkan' });
});

app.post('/api/del', (req, res) => {
  const { role } = req.me;
  const isAdmin = role === 'admin';
  const isStaff = isAdmin || role === 'pelatih';

  const [col, key] = str(req.body.path, 120).split('/');
  if (!key) return res.status(400).json({ error: 'Path tidak valid' });

  if (col === 'absen' || col === 'nilai') {
    if (!isStaff) return res.status(403).json({ error: 'Tidak diizinkan' });
    const [sid, u] = key.split('_');
    db.prepare(`DELETE FROM ${col} WHERE sesi_id = ? AND murid_id = ?`).run(sid, u);
    return res.json({ ok: 1 });
  }

  if (!isAdmin) return res.status(403).json({ error: 'Tidak diizinkan' });

  if (col === 'sesi') {
    db.prepare('DELETE FROM sesi WHERE id = ?').run(key);
    return res.json({ ok: 1 });
  }
  if (col === 'murid') {
    db.prepare('DELETE FROM murid WHERE id = ?').run(key);
    return res.json({ ok: 1 });
  }
  if (col === 'staff') {
    db.prepare('DELETE FROM staff WHERE id = ?').run(key);
    return res.json({ ok: 1 });
  }

  res.status(400).json({ error: 'Rute hapus tidak dikenal' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SBTI Server berjalan di http://localhost:${PORT}`);
});
