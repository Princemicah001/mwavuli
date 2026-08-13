const CACHE_NAME = 'mwavuli-v101-live';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/gallery.html',
    '/project.html',
    '/projects.html',
    '/style.css',
    '/script.js',
    '/gallery.js',
    '/cache-sync.js',
    '/icon.svg',
    '/manifest.json'
];

// Install event - activate immediately and pre-cache shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache partial fail:', err);
            });
        })
    );
});

// Activate event - purge all outdated caches across mobile devices immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Purging outdated cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - Network-First for Code/Style/Scripts, Cache-First for Heavy Media
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!request || request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Bypass Service Worker for all API requests
    if (url.pathname.startsWith('/api/')) return;

    // Code assets (.css, .js, HTML) -> Network-First (always serve fresh updates on refresh)
    const isCodeAsset = request.mode === 'navigate' ||
        (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) ||
        /\.(css|js)$/i.test(url.pathname);

    if (isCodeAsset) {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(async () => {
                const cached = await caches.match(request);
                return cached || fetch(request);
            })
        );
        return;
    }

    // Heavy Media & Fonts -> Cache-First with Stale-While-Revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
                fetch(request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                        cache.put(request, networkResponse.clone());
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(request);
                if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                    cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                return fetch(request);
            }
        })
    );
});
