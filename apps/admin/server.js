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
const webApiBase = String(process.env.ARABISK_WEB_API_URL || 'https://web-production-d41a3.up.railway.app').trim().replace(/\/$/, '');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
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
}
setInterval(cleanupSessions, 15 * 60 * 1000).unref();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; if (body.length > 16 * 1024) reject(new Error('Request body too large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function credentialsMatch(username, password) {
  return Boolean(adminUsername && adminPassword && username === adminUsername && password === adminPassword);
}

function unauthorized(res, message = 'Authentication required') {
  res.writeHead(401, {'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});
  res.end(message);
}

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = clean.replace(/^\/+/, '');
  const target = path.resolve(dist, relative);
  return target.startsWith(path.resolve(dist)) ? target : null;
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
    'X-Arabisk-Admin-Key': adminApiKey
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

  try {
    const upstream = await fetch(upstreamUrl, { method: req.method, headers, body });
    const responseBody = await upstream.text();
    const responseHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(upstream.status, responseHeaders);
    return res.end(responseBody);
  } catch (error) {
    console.error('ARABISK admin proxy error:', error);
    res.writeHead(502, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({ message: 'Unable to reach the web API.' }));
  }
}

const server = http.createServer(async (req, res) => {
  const requestPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && requestPath === '/auth/check') {
    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!credentialsMatch(username, password)) return unauthorized(res, 'Invalid credentials');
      createSession(res, req, username);
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify({ ok: false, message: 'Invalid login request' }));
    }
  }

  if (req.method === 'POST' && requestPath === '/auth/logout') {
    clearSession(res, req);
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ ok: true }));
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
    return res.end(JSON.stringify({ ok: true, service: 'arabisk-admin', authenticationConfigured: Boolean(adminUsername && adminPassword), apiProxyConfigured: Boolean(adminApiKey && webApiBase), activeSessions: sessions.size }));
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

server.listen(port, host, () => console.log(`ARABISK admin listening on ${host}:${port} — session authentication and server-side API proxy enabled`));
