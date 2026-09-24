import { MAX_UPSTREAM_RESPONSE_BYTES, UPSTREAM_API_TIMEOUT_MS } from './config.js';
import { parseJsonBody } from './http-utils.js';

export function createProxyApi({ adminApiKey, webApiBase, requestId }) {
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
      try { body = JSON.stringify(await parseJsonBody(req)); }
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
