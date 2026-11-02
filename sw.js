/**
 * Service Worker — RENCANA PEMBANGUNAN SPAM LANDORUNDUN
 * PERUMDAM Amerta Toraya
 */

const CACHE_NAME = 'spam-landorundun-v3';

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

// Fetch: Network First (ambil kode terbaru dari server, fallback ke cache jika offline)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Jangan cache request ke Google Apps Script (harus selalu live / real-time)
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ status: 'offline', message: 'Anda sedang dalam mode offline.' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Strategi Network-First untuk kode HTML/JS/CSS agar selalu up to date
  event.respondWith(
    fetch(req).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200 && req.method === 'GET') {
        const resClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
      }
      return networkResponse;
    }).catch(() => {
      // Jika offline / jaringan mati, ambil dari cache
      return caches.match(req);
    })
  );
});

