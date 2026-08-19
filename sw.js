const CACHE_NAME = 'mwavuli-v108-fast';

// Fast non-blocking install (0ms delay)
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - purge outdated caches immediately across devices
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// High-Speed Stale-While-Revalidate Engine
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!request || request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Bypass Service Worker for all API endpoints
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(request);

            // Asynchronous background network revalidation
            const networkFetch = fetch(request).then((networkResponse) => {
                if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            }).catch(() => null);

            // Serve cached asset INSTANTLY (0ms latency for repeat/subsequent loads)
            if (cachedResponse) {
                return cachedResponse;
            }

            // Fallback to live network fetch for initial load
            const response = await networkFetch;
            return response || fetch(request);
        })
    );
});
