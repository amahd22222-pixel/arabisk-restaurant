(() => {
'use strict';

const INTERVAL_MS = 10000;
const CUSTOMER_TOKEN_KEY = 'ARABISK_PROFILE_TOKEN_V1';
const MENU_CACHE_KEY = 'arabisk-menu-cache-v1';
const TRACKED_PATHS = [
  /^\/$/,
  /^\/menu(?:\/[^/]+(?:\/[^/]+)?)?$/,
  /^\/events(?:\/[^/]+)?$/,
  /^\/offers$/,
  /^\/memories$/,
  /^\/profile$/,
  /^\/track-order$/
];

let snapshot = null;
let running = false;

function canSync() {
  return navigator.onLine !== false && document.visibilityState !== 'hidden';
}

function shamsBusy() {
  try {
    const status = window.ARABISK_SHAMS?.status?.();
    return Boolean(status?.listening || status?.speaking || status?.busy || status?.conversationActive);
  } catch {
    return false;
  }
}

function pageHasActiveInput() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    active?.isContentEditable === true;
}

function trackedPage() {
  return TRACKED_PATHS.some((pattern) => pattern.test(location.pathname));
}

function getProfileToken() {
  try { return localStorage.getItem(CUSTOMER_TOKEN_KEY) || ''; } catch { return ''; }
}

async function getJson(path, options = {}) {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error('sync request failed: ' + path);
  return response.json();
}

function buildSnapshot(data) {
  const [categories, products, experiences, offer, memories] = data;
  return {
    categories: (Array.isArray(categories) ? categories : []).map(item => ({
      id: item.id,
      active: item.active !== false,
      nameAr: item.nameAr,
      nameEn: item.nameEn
    })),
    products: (Array.isArray(products) ? products : []).map(item => ({
      id: item.id,
      categoryId: item.categoryId,
      available: item.available !== false,
      price: Number(item.price || 0),
      nameAr: item.nameAr,
      imageUrl: item.imageUrl || ''
    })),
    experiences: (Array.isArray(experiences) ? experiences : []).map(item => ({
      id: item.id,
      slug: item.slug,
      status: item.status,
      startsAt: item.startsAt,
      updatedAt: item.updatedAt,
      featured: item.featured === true
    })),
    offer: {
      enabled: offer?.enabled === true,
      productId: offer?.productId || '',
      title: offer?.title || '',
      startsAt: offer?.startsAt || '',
      endsAt: offer?.endsAt || ''
    },
    memories: (Array.isArray(memories) ? memories : []).slice(0, 8).map(item => ({
      id: item.id,
      hidden: item.hidden === true,
      pinned: item.pinned === true,
      updatedAt: item.updatedAt || item.createdAt || ''
    }))
  };
}

function writeMenuCache(categories, products) {
  try {
    sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      categories: Array.isArray(categories) ? categories : [],
      products: Array.isArray(products) ? products : []
    }));
  } catch {}
}

async function syncNow() {
  if (running || !canSync()) return;
  running = true;
  try {
    const token = getProfileToken();
    const data = await Promise.all([
      getJson('/api/categories'),
      getJson('/api/products'),
      getJson('/api/experiences'),
      getJson('/api/promotions/today'),
      getJson('/api/memories?sort=latest&page=1&limit=8'),
      token ? getJson('/api/customer-profile/summary', { headers: { 'X-ARABISK-PROFILE-TOKEN': token } }).catch(() => null) : Promise.resolve(null)
    ]);
    const next = buildSnapshot(data);
    next.customer = data[5]?.profile ? {
      profile: data[5].profile,
      stats: data[5].stats || {},
      orders: data[5].orders || [],
      reservations: data[5].reservations || []
    } : null;
    const changed = snapshot !== null && JSON.stringify(snapshot) !== JSON.stringify(next);
    const previous = snapshot;
    snapshot = next;

    writeMenuCache(data[0], data[1]);

    if (!changed) return;

    const changedKeys = [];
    for (const key of ['categories', 'products', 'experiences', 'offer', 'memories', 'customer']) {
      if (JSON.stringify(previous?.[key]) !== JSON.stringify(next[key])) changedKeys.push(key);
    }

    window.dispatchEvent(new CustomEvent('arabisk:pwa-data-updated', {
      detail: { changedKeys, snapshot: next }
    }));

    if (trackedPage() && !shamsBusy() && !pageHasActiveInput()) {
      window.setTimeout(() => window.location.reload(), 120);
    }
  } catch {}
  finally {
    running = false;
  }
}

window.ARABISK_PWA_SYNC = {
  refresh: syncNow,
  status: () => ({ running, hasSnapshot: snapshot !== null })
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => syncNow(), { timeout: 2500 });
} else {
  window.setTimeout(syncNow, 1200);
}

window.setInterval(syncNow, INTERVAL_MS);
window.addEventListener('online', syncNow);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncNow();
});
})();