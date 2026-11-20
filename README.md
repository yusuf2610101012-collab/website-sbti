# SBTI Management System (Backend SQLite + Revisi Struktur Wilayah & Sabuk)

Backend Express.js + SQLite (`better-sqlite3`) yang sudah terintegrasi penuh dengan frontend **Seni Benggala Trisula Indonesia (SBTI)**.

## Revisi & Fitur yang Sudah Diterapkan
1. **Database Relasional SQLite (`data/sbti.db`)**: Menyimpan semua data secara permanen ke file lokal tanpa bergantung pada Netlify Blobs.
2. **Pembagian Hierarki Wilayah -> Cabang -> Unit Latihan**:
   - Admin dapat menambah/menghapus **Wilayah**, **Cabang** di bawah wilayah tersebut, dan **Unit Latihan** di bawah cabang melalui menu **Pengaturan**.
   - Pilihan *dropdown* otomatis berjenjang (*cascading*) saat murid mendaftar, admin mengedit anggota, atau pelatih membuat sesi latihan.
3. **Tingkatan Sabuk Lengkap**:
   - Putih, Kuning, Hijau, Biru, Merah, Hitam Polos, Hitam Strip 1, Hitam Strip 2, Hitam Strip 3.
   - Tersedia di form pendaftaran, data anggota, filter pencarian, dan cetakan raport.
4. **Kurikulum & Aspek Penilaian SBTI**:
   - **Fisik**: Lari, Push Up, Sit Up, Back Up
   - **Kelincahan**: Reaksi, Keseimbangan
   - **Kekuatan**: Daya Tahan Otot, Kelenturan, Power
   - **Jurus**: Hafal, Menguasai, Mahir

## Cara Menjalankan
1. Ekstrak file ZIP ini dan buka terminal di dalam folder `sbti-fullstack-db`.
2. Jalankan instalasi paket:
   ```bash
   npm install
   ```
3. Jalankan server:
   ```bash
   npm start
   ```
4. Buka browser ke `http://localhost:3000`.
