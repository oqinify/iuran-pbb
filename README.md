# Iuran Kantor Management System

Sistem manajemen iuran kantor modern dengan backend Google Apps Script dan Google Sheets sebagai database. Setiap anggota memiliki pagu (quota) iuran yang dapat dilacak secara real-time.

## Fitur Utama
- **Dashboard Premium**: Ringkasan statistik (Total Pagu, Terpakai, Sisa Saldo) dengan desain modern.
- **Manajemen Anggota**: Daftar anggota beserta status pemakaian pagu mereka.
- **Pencatatan Transaksi**: Input iuran dengan validasi otomatis ke saldo anggota.
- **Real-time Sync**: Sinkronisasi langsung dengan Google Sheets.
- **Aesthetic UI**: Dark mode, glassmorphism, dan animasi halus.

## Cara Instalasi
1. Buat Google Spreadsheet baru.
2. Buka menu **Extensions > Apps Script**.
3. Salin kode dari `Code.gs` ke editor Apps Script.
4. Buat file HTML baru bernama `index` dan salin isi dari `index.html`.
5. Karena Google Apps Script membutuhkan CSS dan JS di dalam file `.html`, Anda tetap perlu memasukkan isi `style.css` ke dalam tag `<style>` dan `app.js` ke dalam tag `<script>` di dalam `index.html` jika ingin di-host di GAS.

## Hosting di GitHub Pages
Proyek ini sudah dikonfigurasi dengan file terpisah yang siap untuk GitHub Pages.

### 1. Persiapan Backend (GAS)
- Deploy skrip Anda sebagai **Web App** (akses: **Anyone**).
- Salin **Web App URL** Anda.

### 2. Persiapan Frontend
- Unggah file `index.html`, `style.css`, dan `app.js` ke repositori GitHub Anda.
- Buka aplikasi Anda di GitHub Pages.
- Buka menu **Settings** di dalam aplikasi, masukkan URL Web App Anda, dan klik simpan.

---
Dibuat dengan ❤️ oleh Antigravity.
