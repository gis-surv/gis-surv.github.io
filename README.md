# Project Peta & Pendaftaran Calon Pelanggan

Aplikasi web responsif untuk pemetaan lokasi atap rumah calon pelanggan baru dan pendataan profil pelanggan air minum, terintegrasi langsung dengan Google Sheets melalui Google Apps Script.

---

## 📁 Struktur Direktori

```text
project_peta_calon_pelanggan/
│
├── css/
│   └── style.css            # Desain tampilan aplikasi & styling responsif
│
├── js/
│   ├── config.js            # Pusat pengaturan (URL Google Apps Script & koordinat default)
│   └── app.js               # Logika peta Leaflet, GPS, form dinamis, & submit data
│
├── backend/
│   └── Code.gs              # Script Google Apps Script untuk Google Sheets
│
├── index.html               # Halaman utama formulir & digitasi poligon atap rumah
├── cetak_peta.html          # Halaman cetak peta topografi A4 Landscape (skala otomatis & poligon)
├── cetak_data.html          # Halaman laporan cetak tabel data realtime (A4 Landscape / PDF)
└── README.md                # Dokumentasi petunjuk penggunaan
```

---

## 🚀 Cara Menjalankan

1. Cukup buka file `index.html` langsung di browser Anda (Google Chrome, Firefox, Safari, atau Edge) atau melalui live server lokal.
2. Tidak memerlukan instalasi Node.js atau dependensi server khusus.

---

## ⚙️ Cara Menghubungkan ke Google Sheets

1. Buat Google Spreadsheet baru di [Google Sheets](https://sheets.new).
2. Di menu atas, pilih **Ekstensi** > **Apps Script**.
3. Buka file `backend/Code.gs` di project ini, salin seluruh kodenya, lalu tempelkan ke editor Google Apps Script.
4. Klik tombol **Deploy (Terapkan)** di pojok kanan atas > **Penerapan Baru (New Deployment)**.
5. Pada ikon gerigi, pilih jenis **Web App (Aplikasi Web)**.
6. Atur konfigurasi:
   * **Execute as (Jalankan sebagai)**: `Me (Email Anda)`
   * **Who has access (Yang memiliki akses)**: `Anyone (Siapa saja)`  *(Wajib agar form bisa mengirim data)*
7. Klik **Deploy**, lalu salin **Web App URL** yang diberikan.
8. Buka file `js/config.js` di project ini, lalu ganti nilai `SCRIPT_URL`:
   ```javascript
   SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwmTjR1yLkeshQBpOsl680LGbftplmOGckLQYuHQI0CA3a8FYeSGj72kxZjCGZ6fHRR/exec",
   ```

---

## 📍 Cara Mengubah Titik Awal Peta

Buka file `js/config.js`, sesuaikan nilai koordinat lintang (*latitude*) dan bujur (*longitude*):

```javascript
INITIAL_COORDS: {
  lat: -2.97190,      // Latitude
  lng: 119.89596,     // Longitude
  defaultZoom: 17,    // Zoom awal tampilan
  gpsZoom: 19         // Zoom saat klik 'Lokasi Saya'
}
```

