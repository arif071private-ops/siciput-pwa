// Service worker Si Ciput — cache app-shell agar bisa terpasang (installable)
// dan tetap bisa dibuka saat sinyal lemah. Data pasien tetap live dari Firestore
// (tidak di-cache di sini), jadi request ke firestore/googleapis dibiarkan lewat.
//
// Strategi update:
// - HTML (dokumen navigasi) & manifest.json  → NETWORK-FIRST, supaya versi
//   terbaru dari Netlify selalu diutamakan begitu online. Fallback ke cache
//   hanya kalau offline.
// - Aset statis (ikon dll)                   → CACHE-FIRST, jarang berubah.

const CACHE_NAME = 'siciput-shell-v2'; // naikkan versi ini tiap kali struktur cache berubah
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // service worker baru langsung aktif, tidak nunggu semua tab ditutup
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // ambil alih tab yang sudah terbuka, tanpa perlu reload manual
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // Jangan sentuh request ke Firebase/Firestore/Google API — biarkan selalu online (real-time).
  if (url.includes('firestore.googleapis.com') ||
      url.includes('firebaseio.com') ||
      url.includes('googleapis.com') ||
      url.includes('gstatic.com')) {
    return; // biarkan browser yang menangani langsung (network)
  }

  const isHTMLOrManifest = req.mode === 'navigate' || url.endsWith('/manifest.json') || url.endsWith('.html');

  if (isHTMLOrManifest) {
    // NETWORK-FIRST: selalu coba ambil versi terbaru dulu.
    event.respondWith(
      fetch(req).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        return resp;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Aset statis lain: CACHE-FIRST, fallback ke network.
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        return resp;
      }).catch(() => cached);
    })
  );
});
