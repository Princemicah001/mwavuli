const CACHE_NAME = 'mwavuli-media-cache-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/gallery.html',
    '/project.html',
    '/projects.html',
    '/style.css',
    '/script.js',
    '/gallery.js',
    '/project.js',
    '/projects.js',
    '/lightbox.js',
    '/icon.svg',
    '/manifest.json',
    '/assets/audio/popup.mp3'
];

// Install event - precache essential static shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache partial fail:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
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

// Fetch event - Cache-First for images, media, assets; Network-First with Cache fallback for API
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!request || request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // Media & Static Assets -> Cache-First + Stale-While-Revalidate
    const isMediaOrAsset =
        url.hostname.includes('cloudinary.com') ||
        url.hostname.includes('unsplash.com') ||
        url.hostname.includes('fontawesome') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.pathname.includes('/uploads/') ||
        url.pathname.includes('/assets/') ||
        /\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|mov|m4v|mp3|wav|ogg|woff2?|ttf|css|js)$/i.test(url.pathname);

    if (isMediaOrAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse) {
                    // Trigger background fetch to keep cache fresh
                    fetch(request).then((networkResponse) => {
                        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                            cache.put(request, networkResponse.clone());
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }

                // If not cached, fetch from network and cache
                try {
                    const networkResponse = await fetch(request);
                    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (err) {
                    return cachedResponse || Response.error();
                }
            })
        );
        return;
    }

    // API requests -> Network-First with Cache Fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request);
            })
        );
        return;
    }

    // Default HTML pages -> Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
                }
                return networkResponse;
            }).catch(() => cachedResponse);
            return cachedResponse || fetchPromise;
        })
    );
});
