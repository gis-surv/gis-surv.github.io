/**
 * Service Worker — RENCANA PEMBANGUNAN SPAM LANDORUNDUN
 * PERUMDAM Amerta Toraya
 */

const CACHE_NAME = 'spam-landorundun-v1';

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

// Install: Simpan aset statis ke cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Bersihkan cache versi lama
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

// Fetch: Strategi Cache First untuk aset lokal, Network First untuk API Spreadsheet
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

  // Aset statis: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && req.method === 'GET') {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

