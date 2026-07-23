// Service Worker for عيادة د. وسن عبدالعزيز رشيد PWA
//
// IMPORTANT: bump CACHE_NAME on every deploy that should force clients to
// pick up fresh content (or, better, just rely on the network-first
// strategy below — it no longer requires bumping this at all).
const CACHE_NAME = 'dr-wesen-clinic-v2';
const urlsToCache = [
  '/',
  '/secretary',
  '/doctor',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => console.log('Cache install failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Skip API calls - always fetch from network
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network-first: always try to get the latest version from the server.
  // Only fall back to the cached copy if the network request fails
  // (e.g. the clinic PC is offline). This is what makes new deployments
  // show up immediately instead of being stuck on whatever was cached
  // the very first time the app was opened.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
