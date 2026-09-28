export function createSmartMenuService({
  repository,
  normalizeList,
  presign,
  storageReady,
  smartPopularWindowMs,
  smartNewWindowMs
}) {
  const { orders } = repository;
  const SMART_SNAPSHOT_CACHE_MS = 30 * 1000;
  const MEDIA_URL_CACHE_MS = 60 * 1000;
  const MAX_MEDIA_URL_CACHE = 1000;
  const SMART_TAGS = new Set(['spicy']);
  const DIETARY_TAGS = new Set(['vegetarian', 'vegan', 'gluten-free']);

  let smartSnapshotCache = null;
  let smartSnapshotCachedAt = 0;
  const mediaUrlCache = new Map();

  const smartSnapshot = (force = false) => {
    const now = Date.now();
    if (!force && smartSnapshotCache && now - smartSnapshotCachedAt < SMART_SNAPSHOT_CACHE_MS) return smartSnapshotCache;
    const cutoff = now - smartPopularWindowMs;
    const sales = new Map();
    for (const order of orders.all()) {
      if (order.status === 'cancelled') continue;
      const created = Date.parse(order.createdAt || '');
      if (!Number.isFinite(created) || created < cutoff) continue;
      for (const item of Array.isArray(order.items) ? order.items : []) {
        sales.set(item.productId, (sales.get(item.productId) || 0) + Number(item.quantity || 0));
      }
    }
    const popularIds = new Set([...sales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id));
    smartSnapshotCache = { sales, popularIds };
    smartSnapshotCachedAt = now;
    return smartSnapshotCache;
  };

  const invalidateSmartSnapshot = () => {
    smartSnapshotCache = null;
    smartSnapshotCachedAt = 0;
  };

  const smartMeta = (product, snapshot) => {
    const tags = normalizeList(product.tags, SMART_TAGS);
    const dietary = normalizeList(product.dietary, DIETARY_TAGS);
    const created = Date.parse(product.createdAt || '');
    const isNew = Boolean(product.isNew) || (Number.isFinite(created) && Date.now() - created <= smartNewWindowMs);
    const spiceLevel = Math.max(0, Math.min(3, Number(product.spiceLevel) || 0));
    return {
      popular: snapshot.popularIds.has(product.id),
      isNew,
      chefChoice: Boolean(product.chefChoice),
      spicy: tags.includes('spicy') || spiceLevel > 0,
      vegetarian: dietary.includes('vegetarian'),
      vegan: dietary.includes('vegan'),
      glutenFree: dietary.includes('gluten-free'),
      spiceLevel,
      tags,
      dietary
    };
  };

  const cachedMediaUrl = (method, key) => {
    const cacheKey = method + ':' + key;
    const now = Date.now();
    const cached = mediaUrlCache.get(cacheKey);
    if (cached && now - cached.createdAt < MEDIA_URL_CACHE_MS) return cached.url;
    const url = presign(method, key, 900);
    if (!cached && mediaUrlCache.size >= MAX_MEDIA_URL_CACHE) {
      const oldestKey = mediaUrlCache.keys().next().value;
      if (oldestKey !== undefined) mediaUrlCache.delete(oldestKey);
    }
    mediaUrlCache.set(cacheKey, { createdAt: now, url });
    return url;
  };

  const withMediaUrls = (product, snapshot = smartSnapshot()) => ({
    ...product,
    imageUrl: product.imageKey && storageReady ? cachedMediaUrl('GET', product.imageKey) : (product.imageUrl || ''),
    videoUrl: product.videoKey && storageReady ? cachedMediaUrl('GET', product.videoKey) : '',
    smart: smartMeta(product, snapshot)
  });

  return { smartSnapshot, smartMeta, withMediaUrls, invalidateSmartSnapshot };
}
