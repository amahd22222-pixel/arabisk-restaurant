import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4174);
const host = '0.0.0.0';
const apiBase = String(process.env.ARABISK_API_BASE || 'https://web-production-d41a3.up.railway.app').replace(/\/$/, '');
const adminToken = String(process.env.ARABISK_ADMIN_TOKEN || '');

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
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function proxyApi(req, res) {
  if (!adminToken) return res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ message: 'Admin API proxy is not configured.' }));
  const upstreamUrl = `${apiBase}${req.url.split('?')[0]}${req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = {
    'X-Admin-Token': adminToken,
    'Accept': req.headers.accept || 'application/json'
  };
  if (body.length) headers['Content-Type'] = req.headers['content-type'] || 'application/json';
  try {
    const upstream = await fetch(upstreamUrl, { method: req.method, headers, body: body.length ? body : undefined });
    const payload = Buffer.from(await upstream.arrayBuffer());
    const responseHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
    res.writeHead(upstream.status, responseHeaders);
    return res.end(payload);
  } catch (error) {
    console.error('ARABISK admin proxy error:', error);
    return res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ message: 'تعذر الاتصال بخدمة الموقع.' }));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url?.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    return res.end(JSON.stringify({ ok: true, service: 'arabisk-admin', apiProxyConfigured: Boolean(adminToken && apiBase) }));
  }

  if (req.url?.split('?')[0] === '/api' || req.url?.startsWith('/api/')) return proxyApi(req, res);

  const target = safePath(req.url);
  if (!target) return res.writeHead(400).end('Bad request');

  fs.stat(target, (error, stats) => {
    if (!error && stats.isFile()) return sendFile(res, target);
    return sendFile(res, path.join(dist, 'index.html'));
  });
});

server.listen(port, host, () => {
  console.log(`ARABISK admin listening on ${host}:${port} — API proxy ${adminToken && apiBase ? 'ready' : 'NOT CONFIGURED'}`);
});
