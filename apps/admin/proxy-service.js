import { MAX_ADMIN_BODY_BYTES, MAX_UPSTREAM_RESPONSE_BYTES, UPSTREAM_API_TIMEOUT_MS } from './config.js';

export function createProxyApi({ adminApiKey, webApiBase, requestId }) {
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

  return async function proxyApiRequest(req, res) {
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
      catch (error) {
        const status = error?.status === 413 ? 413 : 400;
        res.writeHead(status, {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});
        return res.end(JSON.stringify({ message: status === 413 ? 'Request body is too large.' : 'Invalid JSON request.' }));
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
  };
}
