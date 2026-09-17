import crypto from 'node:crypto';

const configuredKey = String(process.env.ARABISK_ADMIN_API_KEY || '').trim();

function constantTimeMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireAdminApiKey(req, res, next) {
  if (!configuredKey) {
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(503).json({ message: 'Admin API authentication is not configured.' });
  }

  const providedKey = String(req.headers['x-arabisk-admin-key'] || '').trim();
  if (!constantTimeMatch(providedKey, configuredKey)) {
    return res.status(403).json({ message: 'Admin authorization required.' });
  }

  return next();
}
