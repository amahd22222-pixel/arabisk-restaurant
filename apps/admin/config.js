const configuredWebApiBase = String(process.env.ARABISK_WEB_API_URL || '').trim().replace(/\/$/, '');
const isRailwayRuntime = Boolean(
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_ENVIRONMENT_NAME
);
const privateWebHost = String(process.env.ARABISK_WEB_API_PRIVATE_DOMAIN || 'web.railway.internal').trim().replace(/\/$/, '');
const privateWebPort = Number(process.env.ARABISK_WEB_API_PRIVATE_PORT || 8080);
const privateWebApiBase = privateWebHost && Number.isInteger(privateWebPort) && privateWebPort > 0 && privateWebPort < 65536
  ? `http://${privateWebHost}:${privateWebPort}`
  : '';

export const adminPort = Number(process.env.PORT || 4174);
export const adminHost = '0.0.0.0';
export const adminUsername = String(process.env.ARABISK_ADMIN_USERNAME || '').trim();
export const adminPassword = String(process.env.ARABISK_ADMIN_PASSWORD || '');
export const adminApiKey = String(process.env.ARABISK_ADMIN_API_KEY || '').trim();

/*
 * Production normally runs admin and web as sibling services in the same
 * Railway environment. Prefer an explicitly configured URL when supplied;
 * otherwise use Railway private networking so the control plane cannot lose
 * its connection merely because a public URL variable was removed.
 */
export const webApiBase = configuredWebApiBase || (
  process.env.NODE_ENV === 'production' && isRailwayRuntime
    ? privateWebApiBase
    : ''
);

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ADMIN_SESSIONS = 2000;
export const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
export const AUTH_RATE_LIMIT = 6;
export const MAX_AUTH_RATE_KEYS = 5000;
export const UPSTREAM_API_TIMEOUT_MS = 15000;
export const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_ADMIN_BODY_BYTES = 256 * 1024;
