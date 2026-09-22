import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4174);
const host = '0.0.0.0';
const adminUsername = String(process.env.ARABISK_ADMIN_USERNAME || '').trim();
const adminPassword = String(process.env.ARABISK_ADMIN_PASSWORD || '');
const adminApiKey = String(process.env.ARABISK_ADMIN_API_KEY || '').trim();
const webApiBase = String(process.env.ARABISK_WEB_API_URL || '').trim().replace(/\/$/, '');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
const AUTH_RATE_LIMIT = 6;
const UPSTREAM_API_TIMEOUT_MS = 15000;
const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;
const sessions = new Map();
const authRate = new Map();
const serverStartedAt = Date.now();
const MAX_ADMIN_BODY_BYTES = 256 * 1024;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

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
  return String(forwarded.at(-1) || req.socket?.remoteAddress || 'unknown').slice(0, 120) || 'unknown';
}

function consumeAuthAttempt(req, res) {
  const now = Date.now();
  const key = getClientKey(req);
  const previous = authRate.get(key);
  if (!previous || now - previous.startedAt >= AUTH_RATE_WINDOW_MS) {
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

function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

function setSecurityHeaders(res, req) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; font-src 'self' data:"
  };
  if (isSecureRequest(req)) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
}

function requestId(req) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(incoming) ? incoming : crypto.randomUUID();
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

function clearSession(res, req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.arabisk_admin_session) sessions.delete(cookies.arabisk_admin_session);
  res.setHeader('Set-Cookie', sessionCookie('', req, 0));
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [key, entry] of authRate) if (now - entry.startedAt >= AUTH_RATE_WINDOW_MS) authRate.delete(key);
}
setInterval(cleanupSessions, 15 * 60 * 1000).unref();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let receivedBytes = 0;
    let settled = false;
    const contentLength = Number(req.headers['content-length']);

    const fail = (message, status = 400) => {
      const error = new Error(message);
      error.status = status;
      reject(error);
    };

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };

    const onData = (chunk) => {
      if (settled) return;
      const chunkBytes = Buffer.byteLength(chunk, 'utf8');
      if (receivedBytes + chunkBytes > MAX_ADMIN_BODY_BYTES) {
        settled = true;
        cleanup();
        req.resume();
        return fail('Request body too large.', 413);
      }
      receivedBytes += chunkBytes;
      body += chunk;
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { resolve(body ? JSON.parse(body) : {}); } catch { fail('Invalid JSON request.'); }
    };

    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    if (Number.isFinite(contentLength) && contentLength > MAX_ADMIN_BODY_BYTES) {
      settled = true;
      req.resume();
      return fail('Request body too large.', 413);
    }

    req.setEncoding('utf8');
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

function constantTimeTextMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function credentialsMatch(username, password) {
  return Boolean(
    adminUsername &&
    adminPassword &&
    constantTimeTextMatch(username, adminUsername) &&
    constantTimeTextMatch(password, adminPassword)
  );
}

function unauthorized(res, message = 'Authentication required') {
  res.writeHead(401, {'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});
  res.end(message);
}

function safePath(urlPath) {
  let clean;
  try { clean = decodeURIComponent((urlPath || '/').split('?')[0]); } catch { return null; }
  const root = path.resolve(dist);
  const relative = clean.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

function sendFile(res, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return res.writeHead(404).end('Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function proxyApiRequest(req, res) {
  if (!adminApiKey) {
    res.writeHead(503, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ message: 'Admin API proxy is not configured.' }));
  }
  if (!webApiBase) {
    res.writeHead(503, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ message: 'Web API URL is not configured.' }));
  }

  const incoming = new URL(req.url || '/proxy', `http://${req.headers.host || 'localhost'}`);
  const upstreamPath = incoming.pathname.replace(/^\/proxy/, '') || '/';
  if (!upstreamPath.startsWith('/api/')) {
    res.writeHead(404, {'Cache-Control':'no-store'});
    return res.end('Not found');
  }

  const upstreamUrl = new URL(`${upstreamPath}${incoming.search}`, `${webApiBase}/`).toString();
  const headers = {
    Accept: 'application/json',
    'X-Arabisk-Admin-Key': adminApiKey,
    'X-Request-Id': String(res.getHeader('X-Request-Id') || requestId(req))
  };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  let body;
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    try { body = JSON.stringify(await parseBody(req)); }
    catch {
      res.writeHead(400, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ message: 'Invalid JSON request.' }));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_API_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl, { method: req.method, headers, body, signal: controller.signal });
    const contentLength = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_RESPONSE_BYTES) {
      return res.writeHead(502, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'})
        .end(JSON.stringify({ message: 'Web API response is too large.' }));
    }
    const reader = upstream.body?.getReader();
    let responseBody = '';
    let receivedBytes = 0;
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          responseBody += decoder.decode();
          break;
        }
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
          await reader.cancel();
          return res.writeHead(502, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'})
            .end(JSON.stringify({ message: 'Web API response is too large.' }));
        }
        responseBody += decoder.decode(value, { stream: true });
      }
    } else {
      responseBody = await upstream.text();
    }
    const responseHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(upstream.status, responseHeaders);
    return res.end(responseBody);
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    console.error(JSON.stringify({
      event: 'admin_proxy_error',
      requestId: String(res.getHeader('X-Request-Id') || requestId(req)),
      message: timedOut ? 'upstream_timeout' : String(error?.message || error)
    }));
    res.writeHead(timedOut ? 504 : 502, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ message: timedOut ? 'The web API took too long to respond.' : 'Unable to reach the web API.' }));
  } finally {
    clearTimeout(timeout);
  }
}

const server = http.createServer(async (req, res) => {
  const id = requestId(req);
  const startedAt = process.hrtime.bigint();
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    if (res.statusCode < 500) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.error(JSON.stringify({
      event: 'admin_http_server_error',
      requestId: id,
      method: req.method,
      route: (req.url || '/').startsWith('/proxy/') ? '/proxy' : (req.url || '/').split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100
    }));
  });
  setSecurityHeaders(res, req);
  const requestPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && requestPath === '/auth/check') {
    if (consumeAuthAttempt(req, res)) return;
    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!credentialsMatch(username, password)) return unauthorized(res, 'Invalid credentials');
      authRate.delete(getClientKey(req));
      createSession(res, req, username);
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      const status = error?.status === 413 ? 413 : 400;
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify({ ok: false, message: status === 413 ? 'Request body is too large.' : 'Invalid login request' }));
    }
  }

  if (req.method === 'POST' && requestPath === '/auth/logout') {
    clearSession(res, req);
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ ok: true }));
  }

  if (requestPath === '/revenue-recovery') {
    const incoming = new URL(req.url || '/revenue-recovery', `http://${req.headers.host || 'localhost'}`);
    const token = String(incoming.searchParams.get('token') || '').trim();
    if (!token || token.length > 80) return res.writeHead(400).end('Invalid recovery link');
    return redirect(res, `${webApiBase}/cart?recover=${encodeURIComponent(token)}`);
  }

  if (requestPath === '/auth/session') {
    const session = getSession(req);
    if (!session) return unauthorized(res, 'Session expired');
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ ok: true, username: session.session.username }));
  }

  if (requestPath === '/proxy' || requestPath.startsWith('/proxy/')) {
    if (req.method === 'OPTIONS') { res.writeHead(204, {'Cache-Control':'no-store'}); return res.end(); }
    if (!getSession(req)) return unauthorized(res, 'Authentication required');
    return proxyApiRequest(req, res);
  }

  if (requestPath === '/health') {
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
    return res.end(JSON.stringify({ ok: true, service: 'arabisk-admin', uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000) }));
  }

  if (requestPath === '/' || requestPath === '/login' || requestPath === '/login/') return sendFile(res, path.join(dist, 'login.html'));
  if (requestPath === '/index.html' || requestPath === '/login.html') return redirect(res, '/login');

  if (requestPath === '/dashboard' || requestPath === '/dashboard/') {
    if (!getSession(req)) return redirect(res, '/login');
    return sendFile(res, path.join(dist, 'dashboard.html'));
  }
  if (requestPath === '/dashboard.html') return redirect(res, '/dashboard');

  const target = safePath(req.url);
  if (!target) return res.writeHead(400).end('Bad request');
  fs.stat(target, (error, stats) => {
    if (!error && stats.isFile()) return sendFile(res, target);
    return res.writeHead(404).end('Not found');
  });
});

const shutdown = (signal) => {
  console.log(`ARABISK admin received ${signal}; shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.listen(port, host, () => console.log(`ARABISK admin listening on ${host}:${port} — session authentication and server-side API proxy enabled`));
