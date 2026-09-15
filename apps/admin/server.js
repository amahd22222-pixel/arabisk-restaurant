import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4174);
const host = '0.0.0.0';
const apiOrigin = String(process.env.ARABISK_API_ORIGIN || 'https://web-production-d41a3.up.railway.app').replace(/\/$/, '');
const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
const adminPassword = String(process.env.ADMIN_PASSWORD || '');
const adminSecret = String(process.env.ARABISK_ADMIN_API_SECRET || '').trim();

const authConfigured = Boolean(adminUsername && adminPassword && adminSecret);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

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
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function unauthorized(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'WWW-Authenticate': 'Basic realm="ARABISK Admin", charset="UTF-8"',
    'Cache-Control': 'no-store'
  });
  return res.end('Authentication required');
}

function isAuthenticated(req) {
  if (!authConfigured) return false;
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === adminUsername && password === adminPassword;
  } catch {
    return false;
  }
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxyApi(req, res) {
  if (!authConfigured) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ message: 'Admin authentication is not configured on the service.' }));
  }

  try {
    const body = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await readRequestBody(req);
    const response = await fetch(`${apiOrigin}${req.url}`, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'X-Arabisk-Admin-Secret': adminSecret
      },
      body
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    return res.end(buffer);
  } catch (error) {
    console.error('ARABISK admin API proxy error:', error);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ message: 'تعذر الاتصال بخادم ARABISK.' }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url?.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, service: 'arabisk-admin' }));
  }

  if (!isAuthenticated(req)) return unauthorized(res);

  if (req.url?.startsWith('/api/')) return proxyApi(req, res);

  const target = safePath(req.url);
  if (!target) return res.writeHead(400).end('Bad request');

  fs.stat(target, (error, stats) => {
    if (!error && stats.isFile()) return sendFile(res, target);
    return sendFile(res, path.join(dist, 'index.html'));
  });
});

server.listen(port, host, () => {
  console.log(`ARABISK admin listening on ${host}:${port} — auth ${authConfigured ? 'configured' : 'MISSING'}`);
});
