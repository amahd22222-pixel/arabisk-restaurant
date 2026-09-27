const CACHE_VERSION = 'arabisk-pwa-v8';
const APP_SHELL = [
  '/',
  '/index.html',
  '/home-app.css',
  '/app-pages.css',
  '/app.js',
  '/app-header.js',
  '/home-shell.js',
  '/pwa-ui.js',
  '/pwa-register.js',
  '/mobile-nav.css',
  '/mobile-nav.js',
  '/studio-runtime.js',
  '/manifest.json',
  '/offline.html',
  '/icons/icon.svg',
  '/icons/maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function shouldBypass(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/proxy/') ||
    url.pathname.startsWith('/auth/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !isSameOrigin(request) || shouldBypass(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/index.html') || caches.match('/offline.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});

// ---- Push notifications ----

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ARABISK', body: event.data ? event.data.text() : '' };
  }

  const title = String(data.title || 'ARABISK').slice(0, 80);
  const options = {
    body: String(data.body || '').slice(0, 200),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: String(data.tag || 'arabisk-notification').slice(0, 60),
    data: { url: String(data.url || '/') },
    dir: 'rtl',
    lang: 'ar'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
