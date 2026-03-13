const CACHE_NAME = 'goods-receiving-v9';
const BASE = self.registration.scope;
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pdf-gen.js',
  './manifest.json',
  './icons/logo.png',
  './icons/logo2.jpg',
  './lib/jspdf.umd.min.js',
  './lib/html2canvas.min.js',
];

// Install: cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for everything (offline-first PWA)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Translation API — network only, don't cache
  if (request.url.includes('mymemory.translated.net')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cache, update in background
        fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
          return caches.match(BASE + 'index.html') || caches.match('./index.html');
        }
      });
    })
  );
});
