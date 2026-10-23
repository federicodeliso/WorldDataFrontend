const CACHE_NAME = 'worlddata-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/worlddata.db',
  '/sql-wasm.wasm'
];

// Install event - caching core assets and database
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache, storing offline files...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found, otherwise fetch from network
      return cachedResponse || fetch(event.request);
    })
  );
});