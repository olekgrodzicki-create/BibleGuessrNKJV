const CACHE_VERSION = 'v7';
const CACHE_NAME = 'bibleguessr-' + CACHE_VERSION;
const urlsToCache = ['./', './index.html', './manifest.json'];

// Install — cache files, activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache).catch(() => Promise.resolve()))
  );
  self.skipWaiting();
});

// Activate — delete old caches, take control
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — serve from cache instantly, revalidate in background ONLY for HTML
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isHTML = event.request.destination === 'document'
    || event.request.url.endsWith('.html')
    || event.request.url.endsWith('/');

  if (isHTML) {
    // Stale-while-revalidate: serve cache immediately, fetch update silently in background
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            if (response && response.status === 200) {
              // Check if content actually changed before notifying
              response.clone().text().then(newText => {
                if (cached) {
                  cached.clone().text().then(oldText => {
                    if (newText !== oldText) {
                      // Content changed — update cache and notify clients
                      cache.put(event.request, new Response(newText, {
                        status: 200,
                        headers: response.headers
                      }));
                      self.clients.matchAll().then(clients => {
                        clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
                      });
                    }
                  });
                } else {
                  cache.put(event.request, response.clone());
                }
              });
            }
            return response;
          }).catch(() => null);

          return cached || networkFetch;
        });
      })
    );
  } else {
    // Cache first for everything else
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
          }
          return response;
        });
      })
    );
  }
});

// Force update when app requests it
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
