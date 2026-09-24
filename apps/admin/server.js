import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adminPort,
  adminHost,
  adminApiKey,
  webApiBase
} from './config.js';
import { createAdminAuth } from './auth-service.js';
import { setSecurityHeaders, requestId, unauthorized, safePath, sendFile, redirect, parseJsonBody } from './http-utils.js';
import { createProxyApi } from './proxy-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, 'dist');
const serverStartedAt = Date.now();
const { consumeAuthAttempt, credentialsMatch, getSession, createSession, clearSession, resetAuthAttempts } = createAdminAuth();
const proxyApiRequest = createProxyApi({ adminApiKey, webApiBase, requestId });

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
      const body = await parseJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!credentialsMatch(username, password)) return unauthorized(res, 'Invalid credentials');
      resetAuthAttempts(req);
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

  const target = safePath(req.url, dist);
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
server.listen(adminPort, adminHost, () => console.log(`ARABISK admin listening on ${adminHost}:${adminPort} — session authentication and server-side API proxy enabled`));
