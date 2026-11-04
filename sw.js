/**
 * Service Worker — DAFTAR CALON PELANGGAN SPAM LANDORUNDUN SESEAN SULOARA'
 * PERUMDAM Amerta Toraya
 */

const CACHE_NAME = 'spam-landorundun-v6';

const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './cetak_peta.html',
  './cetak_data.html',
  './cetak_pipa.html',
  './admin.html',
  './css/style.css',
  './css/admin.css',
  './js/config.js',
  './js/auth.js',
  './js/app.js',
  './js/admin.js',
  './js/pwa.js',
  './manifest.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/favicon-16x16.png',
  './assets/icons/og-image.png'
];

// Install: Simpan aset statis ke cache & segera aktif
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate: Bersihkan cache versi lama secara instan
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Hanya intercept aset statis lokal (same-origin).
// Request eksternal (Google Maps Satelit mt0-mt3, CDN Leaflet, dsb) TIDAK DIINTERCEPT
// agar peta satelit dimuat langsung oleh browser dengan kecepatan native tanpa hambatan Service Worker!
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Lewatkan semua request ke domain luar (Google Maps tiles, unpkg, Apps Script, dll)
  if (url.origin !== self.location.origin) {
    return; // Browser langsung memprosesnya di jaringan tercepat tanpa SW
  }

  // 2. Hanya proses method GET untuk file lokal
  if (req.method !== 'GET') {
    return;
  }

  // 3. Strategi Network-First untuk kode HTML/JS/CSS lokal
  event.respondWith(
    fetch(req).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        const resClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(req);
    })
  );
});
