import crypto from 'node:crypto';

const configuredKey = String(process.env.ARABISK_ADMIN_API_KEY || '').trim();
const runtimeEnvironment = String(
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || ''
).trim().toLowerCase();
const isProductionRuntime =
  process.env.NODE_ENV === 'production' || runtimeEnvironment === 'production';

const ADMIN_KEY_MIN_LENGTH = 32;

function constantTimeMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function hasValidProductionKey() {
  return configuredKey.length >= ADMIN_KEY_MIN_LENGTH;
}

export function isAdminApiKeyValid(req) {
  if (!configuredKey) return !isProductionRuntime;
  if (isProductionRuntime && !hasValidProductionKey()) return false;
  const providedKey = String(req.headers['x-arabisk-admin-key'] || '').trim();
  return constantTimeMatch(providedKey, configuredKey);
}

export function requireAdminApiKey(req, res, next) {
  if (!configuredKey) {
    if (!isProductionRuntime) return next();
    return res.status(503).json({
      code: 'ADMIN_AUTH_NOT_CONFIGURED',
      message: 'Admin API authentication is not configured.'
    });
  }

  if (isProductionRuntime && !hasValidProductionKey()) {
    return res.status(503).json({
      code: 'ADMIN_AUTH_INVALID_CONFIGURATION',
      message: 'Admin API authentication is not securely configured.'
    });
  }

  if (!isAdminApiKeyValid(req)) {
    return res.status(401).json({
      code: 'ADMIN_AUTH_REQUIRED',
      message: 'Admin authorization required.'
    });
  }

  return next();
}
