import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

export function setSecurityHeaders(res, req) {
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

export function requestId(req) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(incoming) ? incoming : crypto.randomUUID();
}

export function unauthorized(res, message = 'Authentication required') {
  res.writeHead(401, {'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'});
  res.end(message);
}

export function safePath(urlPath, dist) {
  let clean;
  try { clean = decodeURIComponent((urlPath || '/').split('?')[0]); } catch { return null; }
  const root = path.resolve(dist);
  const relative = clean.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

export function sendFile(res, filePath) {
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

export function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}
