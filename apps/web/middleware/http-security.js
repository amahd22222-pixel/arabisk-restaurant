import cors from 'cors';
import crypto from 'node:crypto';

const errorRouteForLog = (req) => {
  const matchedRoute = req.route?.path;
  if (matchedRoute) return String(matchedRoute).slice(0, 160);
  if (req.path.startsWith('/api/')) {
    const segments = req.path.split('/').filter(Boolean);
    return '/' + segments.slice(0, 2).join('/');
  }
  return req.path.slice(0, 160);
};

export function configureHttpSecurity(app, { allowedCorsOrigins, isProductionRuntime }) {
  const corsOptions = {
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Arabisk-Admin-Key']
  };

  app.disable('x-powered-by');
  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));

  const requestId = (req) => {
    const incoming = String(req.get('X-Request-Id') || '').trim();
    return /^[A-Za-z0-9._-]{1,80}$/.test(incoming) ? incoming : crypto.randomUUID();
  };

  app.use((req, res, next) => {
    const id = requestId(req);
    res.locals.requestId = id;
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      if (res.statusCode < 500) return;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.error(JSON.stringify({
        event: 'http_server_error',
        requestId: id,
        method: req.method,
        route: errorRouteForLog(req),
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100
      }));
    });

    res.setHeader('X-Request-Id', id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    if (req.secure || isProductionRuntime) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path === '/health' || req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    next();
  });
}
