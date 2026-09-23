export function createRateLimiter({
  windowMs,
  limit,
  message,
  maxKeys = 5000,
  keyResolver = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown').trim().slice(0, 120) || 'unknown'
}) {
  const store = new Map();

  const remember = (key, entry) => {
    const now = Date.now();
    if (!store.has(key) && store.size >= maxKeys) {
      for (const [oldKey, oldEntry] of store) {
        if (now - oldEntry.startedAt >= windowMs) {
          store.delete(oldKey);
          break;
        }
      }
      if (store.size >= maxKeys) {
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) store.delete(oldestKey);
      }
    }
    store.set(key, entry);
  };

  const middleware = (req, res, next) => {
    const now = Date.now();
    const key = keyResolver(req);
    const previous = store.get(key);

    if (!previous || now - previous.startedAt >= windowMs) {
      remember(key, { startedAt: now, count: 1 });
      return next();
    }

    if (previous.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - previous.startedAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message, retryAfter });
    }

    previous.count += 1;
    return next();
  };

  middleware.cleanup = () => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [key, entry] of store) {
      if (entry.startedAt < cutoff) store.delete(key);
    }
  };

  return middleware;
}
