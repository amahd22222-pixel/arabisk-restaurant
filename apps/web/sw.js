const CACHE_VERSION = 'arabisk-pwa-v42';
const APP_SHELL = [
  '/',
  '/index.html',
  '/menu',
  '/reservation',
  '/cart',
  '/events',
  '/offers',
  '/memories',
  '/track-order',
  '/profile',
  '/profile-page.css',
  '/profile-page.js?v=20260928.1',
  '/category-page.html',
  '/product-page.html',
  '/event-page.html',
  '/home-app.css',
  '/app-pages.css',
  '/app.js',
  '/app-header.js',
  '/home-shell.js',
  '/cart.js',
  '/cart.js?v=20260928.2',
  '/cart-page.js',
  '/profile-page.js',
  '/smart-menu.js?v=20260920.10',
  '/product-page.js?v=20260920.9',
  '/events.js?v=20260918.1',
  '/offers-page.js',
  '/event-detail.js?v=20260919.2',
  '/pwa-ui.js',
  '/pwa-register.js',
  '/pwa-profile.js',
  '/pwa-notifications.js',
  '/pwa-network.js',
  '/pwa-media.js',
  '/mobile-nav.css',
  '/mobile-nav.js',
  '/studio-runtime.js',
  '/shams.js',
  '/shams.css',
  '/manifest.json',
  '/offline.html',
  '/icons/icon.svg',
  '/icons/maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/api/categories',
  '/api/products',
  '/api/experiences',
  '/api/promotions/today',
  '/api/promotions/install',
  '/api/memories?limit=4',
  '/api/memories?sort=latest&page=1&limit=8'
];

const PUBLIC_GET_APIS = new Set([
  '/api/categories',
  '/api/products',
  '/api/experiences',
  '/api/promotions/today',
  '/api/promotions/install',
  '/api/memories'
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      try { await cache.add(url); } catch (error) { console.warn('[ARABISK PWA] shell asset skipped:', url, error?.message || error); }
    }));
    await self.skipWaiting();
  })());
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
  return url.pathname.startsWith('/proxy/') || url.pathname.startsWith('/auth/');
}

function shouldNetworkFirst(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  return request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'manifest' ||
    pathname.endsWith('.html') ||
    pathname === '/sw.js';
}

function shouldCachePublicApi(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && PUBLIC_GET_APIS.has(url.pathname);
}

async function cacheResponse(request, response) {
  if (!response?.ok || response.type !== 'basic') return response;
  try {
    const copy = response.clone();
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, copy);
  } catch {}
  return response;
}

async function fetchWithTimeout(request, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) return cacheResponse(request, response);
    const cached = await caches.match(request);
    return cached || response;
  } catch {
    return caches.match(request);
  }
}

async function publicApiFirst(request) {
  try {
    const response = await fetchWithTimeout(request, 4500);
    if (response.ok) {
      await cacheResponse(request, response);
      return response;
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ message: 'offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

async function navigationFallback(request) {
  const pathname = new URL(request.url).pathname;

  const fallbackToCache = async () => {
    const exact = await caches.match(request);
    if (exact) return exact;

    if (pathname === '/menu') {
      const menu = await caches.match('/menu');
      if (menu) return menu;
    }

    if (/^\/menu\/[^/]+$/.test(pathname)) {
      const template = await caches.match('/category-page.html');
      if (template) return template;
    }

    if (/^\/menu\/[^/]+\/[^/]+$/.test(pathname)) {
      const template = await caches.match('/product-page.html');
      if (template) return template;
    }

    if (pathname === '/events') {
      const events = await caches.match('/events');
      if (events) return events;
    }

    if (/^\/events\/[^/]+$/.test(pathname)) {
      const template = await caches.match('/event-page.html');
      if (template) return template;
    }

    return (await caches.match(pathname)) ||
      (await caches.match('/index.html')) ||
      (await caches.match('/offline.html'));
  };

  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) return cacheResponse(request, response);
    return (await fallbackToCache()) || response;
  } catch {
    return fallbackToCache();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !isSameOrigin(request) || shouldBypass(request)) return;

  if (shouldCachePublicApi(request)) {
    event.respondWith(publicApiFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (shouldNetworkFirst(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => cacheResponse(request, response));
    })
  );
});

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
  let absoluteTarget;
  try {
    absoluteTarget = new URL(targetUrl, self.location.origin);
    if (absoluteTarget.origin !== self.location.origin) absoluteTarget = new URL('/', self.location.origin);
    if (!/^https?:$/.test(absoluteTarget.protocol)) absoluteTarget = new URL('/', self.location.origin);
  } catch {
    absoluteTarget = new URL('/', self.location.origin);
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        try {
          const currentUrl = new URL(client.url);
          const exactMatch =
            currentUrl.origin === absoluteTarget.origin &&
            currentUrl.pathname === absoluteTarget.pathname &&
            currentUrl.search === absoluteTarget.search;
          if (exactMatch && 'focus' in client) return client.focus();
        } catch {}
      }
      if (self.clients.openWindow) return self.clients.openWindow(absoluteTarget.href);
    })
  );
});