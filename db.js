import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'sbti.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Inisialisasi Tabel Relasional
db.exec(`
  CREATE TABLE IF NOT EXISTS sys_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cfg_main (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    kode TEXT DEFAULT '',
    site_json TEXT DEFAULT '{}',
    aspek_json TEXT DEFAULT '[]',
    wilayah_tree_json TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS murid (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    noAnggota TEXT NOT NULL,
    jk TEXT NOT NULL DEFAULT 'Laki-laki',
    telp TEXT DEFAULT '',
    sabuk TEXT NOT NULL DEFAULT 'Putih',
    wilayah TEXT DEFAULT '',
    cabang TEXT DEFAULT '',
    unit_latihan TEXT DEFAULT '',
    tglGabung TEXT NOT NULL,
    aktif INTEGER NOT NULL DEFAULT 1,
    ph TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pelatih',
    wilayah TEXT DEFAULT '',
    cabang TEXT DEFAULT '',
    unit_latihan TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sesi (
    id TEXT PRIMARY KEY,
    tgl TEXT NOT NULL,
    materi TEXT NOT NULL,
    pelatih TEXT DEFAULT '',
    wilayah TEXT DEFAULT '',
    cabang TEXT DEFAULT '',
    unit_latihan TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS absen (
    sesi_id TEXT NOT NULL,
    murid_id TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (sesi_id, murid_id),
    FOREIGN KEY (sesi_id) REFERENCES sesi(id) ON DELETE CASCADE,
    FOREIGN KEY (murid_id) REFERENCES murid(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nilai (
    sesi_id TEXT NOT NULL,
    murid_id TEXT NOT NULL,
    skor_json TEXT NOT NULL DEFAULT '{}',
    catatan TEXT DEFAULT '',
    oleh TEXT DEFAULT '',
    PRIMARY KEY (sesi_id, murid_id),
    FOREIGN KEY (sesi_id) REFERENCES sesi(id) ON DELETE CASCADE,
    FOREIGN KEY (murid_id) REFERENCES murid(id) ON DELETE CASCADE
  );
`);

export const SABUK_LIST = [
  'Putih',
  'Kuning',
  'Hijau',
  'Biru',
  'Merah',
  'Hitam Polos',
  'Hitam Strip 1',
  'Hitam Strip 2',
  'Hitam Strip 3'
];

export const DEFAULT_ASPEK = [
  { id: 'f_lari', kategori: 'Fisik', nama: 'Lari' },
  { id: 'f_pushup', kategori: 'Fisik', nama: 'Push Up' },
  { id: 'f_situp', kategori: 'Fisik', nama: 'Sit Up' },
  { id: 'f_backup', kategori: 'Fisik', nama: 'Back Up' },
  { id: 'k_reaksi', kategori: 'Kelincahan', nama: 'Reaksi' },
  { id: 'k_keseimbangan', kategori: 'Kelincahan', nama: 'Keseimbangan' },
  { id: 's_dayatahan', kategori: 'Kekuatan', nama: 'Daya Tahan Otot' },
  { id: 's_kelenturan', kategori: 'Kekuatan', nama: 'Kelenturan' },
  { id: 's_power', kategori: 'Kekuatan', nama: 'Power' },
  { id: 'j_hafal', kategori: 'Jurus', nama: 'Hafal' },
  { id: 'j_menguasai', kategori: 'Jurus', nama: 'Menguasai' },
  { id: 'j_mahir', kategori: 'Jurus', nama: 'Mahir' }
];

// Contoh struktur awal Wilayah -> Cabang -> Unit Latihan (bisa diubah bebas oleh Admin di Pengaturan)
export const DEFAULT_WILAYAH_TREE = [
  {
    id: 'w1',
    wilayah: 'Banten',
    cabang: [
      {
        id: 'c1',
        nama: 'Kab. Tangerang',
        unit: ['Ranting Purati', 'SMPIT Birrul Walidain']
      },
      {
        id: 'c2',
        nama: 'Kota Tangerang',
        unit: ['Unit Pusat Tangerang']
      }
    ]
  }
];

const row = db.prepare('SELECT id FROM cfg_main WHERE id = 1').get();
if (!row) {
  db.prepare('INSERT INTO cfg_main (id, kode, site_json, aspek_json, wilayah_tree_json) VALUES (1, ?, ?, ?, ?)')
    .run('', '{}', JSON.stringify(DEFAULT_ASPEK), JSON.stringify(DEFAULT_WILAYAH_TREE));
}

export default db;
