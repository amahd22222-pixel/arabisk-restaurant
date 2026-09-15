import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4174);
const host = '0.0.0.0';

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

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url?.startsWith('/health?')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    return res.end(JSON.stringify({ ok: true, service: 'arabisk-admin' }));
  }

  const target = safePath(req.url);
  if (!target) return res.writeHead(400).end('Bad request');

  fs.stat(target, (error, stats) => {
    if (!error && stats.isFile()) return sendFile(res, target);
    return sendFile(res, path.join(dist, 'index.html'));
  });
});

server.listen(port, host, () => {
  console.log(`ARABISK admin listening on ${host}:${port}`);
});
