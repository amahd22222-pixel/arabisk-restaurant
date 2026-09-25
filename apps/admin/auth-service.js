import crypto from 'node:crypto';
import { isSecureRequest } from './http-utils.js';
import {
  adminUsername,
  adminPassword,
  SESSION_TTL_MS,
  AUTH_RATE_WINDOW_MS,
  AUTH_RATE_LIMIT,
  MAX_AUTH_RATE_KEYS
} from './config.js';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part, ''];
    const name = part.slice(0, separator);
    const rawValue = part.slice(separator + 1);
    try { return [name, decodeURIComponent(rawValue)]; } catch { return [name, rawValue]; }
  }));
}

function getClientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((value) => value.trim()).filter(Boolean);
  const remote = String(req.socket?.remoteAddress || 'unknown');
  // The admin service runs behind Railway's trusted proxy. Use the last forwarded
  // address so a client cannot prepend an arbitrary value to bypass the limiter.
  return String(forwarded.at(-1) || remote).slice(0, 120) || 'unknown';
}

function constantTimeTextMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createAdminAuth() {
  const sessions = new Map();
  const authRate = new Map();

  function consumeAuthAttempt(req, res) {
    const now = Date.now();
    const key = getClientKey(req);
    const previous = authRate.get(key);
    if (!previous || now - previous.startedAt >= AUTH_RATE_WINDOW_MS) {
      if (!previous && authRate.size >= MAX_AUTH_RATE_KEYS) {
        for (const [oldKey, oldEntry] of authRate) {
          if (now - oldEntry.startedAt >= AUTH_RATE_WINDOW_MS) {
            authRate.delete(oldKey);
            break;
          }
        }
        if (authRate.size >= MAX_AUTH_RATE_KEYS) {
          const oldest = authRate.keys().next().value;
          if (oldest !== undefined) authRate.delete(oldest);
        }
      }
      authRate.set(key, { startedAt: now, count: 1 });
      return false;
    }
    if (previous.count >= AUTH_RATE_LIMIT) {
      const retryAfter = Math.max(1, Math.ceil((AUTH_RATE_WINDOW_MS - (now - previous.startedAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.writeHead(429, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'});
      res.end(JSON.stringify({ ok: false, message: 'Too many login attempts. Please try again later.', retryAfter }));
      return true;
    }
    previous.count += 1;
    return false;
  }

  function sessionCookie(token, req, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
    const secure = isSecureRequest(req) ? '; Secure' : '';
    return `arabisk_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  function getSession(req) {
    const token = parseCookies(req.headers.cookie || '').arabisk_admin_session;
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return { token, session };
  }

  function createSession(res, req, username) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie', sessionCookie(token, req));
  }

  function resetAuthAttempts(req) {
    authRate.delete(getClientKey(req));
  }

  function clearSession(res, req) {
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.arabisk_admin_session) sessions.delete(cookies.arabisk_admin_session);
    res.setHeader('Set-Cookie', sessionCookie('', req, 0));
  }

  function credentialsMatch(username, password) {
    return Boolean(
      adminUsername &&
      adminPassword &&
      constantTimeTextMatch(username, adminUsername) &&
      constantTimeTextMatch(password, adminPassword)
    );
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
    for (const [key, entry] of authRate) if (now - entry.startedAt >= AUTH_RATE_WINDOW_MS) authRate.delete(key);
  }, 15 * 60 * 1000);
  cleanupTimer.unref();

  return { consumeAuthAttempt, credentialsMatch, getSession, createSession, clearSession, resetAuthAttempts };
}
