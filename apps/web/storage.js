import crypto from 'node:crypto';

const env = (name) => process.env[name] || '';
const endpoint = String(env('AWS_ENDPOINT_URL') || 'https://t3.storageapi.dev').replace(/\/$/, '');
const region = String(env('AWS_DEFAULT_REGION') || 'auto');
const bucket = String(env('AWS_S3_BUCKET_NAME') || '').trim();
const accessKey = String(env('AWS_' + 'ACCESS_KEY_ID') || '').trim();
const secretKey = String(env('AWS_' + 'SECRET_' + 'ACCESS_KEY') || '').trim();

export const storageReady = Boolean(bucket && accessKey && secretKey);
const STORAGE_READ_TIMEOUT_MS = 8000;
const STORAGE_WRITE_TIMEOUT_MS = 10000;
const MAX_KEY_LENGTH = 500;
const MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_JSON_REQUEST_BYTES = 8 * 1024 * 1024;

function normalizeKey(key) {
  const value = String(key ?? '').trim();
  if (!value || value.length > MAX_KEY_LENGTH) return null;
  if (value.includes('\\') || value.includes('..') || value.startsWith('/') || value.includes('\0')) return null;
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return value;
}

async function storageFetch(url, options = {}, timeoutMs = STORAGE_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const uri = (key) => `/${encode(bucket)}/${key.split('/').map(encode).join('/')}`;
const signingKey = (date) => {
  const d = hmac(`AWS4${secretKey}`, date);
  const r = hmac(d, region);
  const s = hmac(r, 's3');
  return hmac(s, 'aws4_request');
};

export function presign(method, key, expires = 900) {
  const normalizedKey = normalizeKey(key);
  if (!storageReady) throw new Error('Storage is not configured');
  if (!normalizedKey) throw new Error('Invalid storage key');
  const safeExpires = Math.max(1, Math.min(3600, Number(expires) || 900));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const credential = `${accessKey}/${date}/${region}/s3/aws4_request`;
  const host = new URL(endpoint).host;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(safeExpires),
    'X-Amz-SignedHeaders': 'host'
  });
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
  const canonicalRequest = [method, uri(normalizedKey), canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  query.set('X-Amz-Signature', hmac(signingKey(date), stringToSign, 'hex'));
  return `${endpoint}${uri(normalizedKey)}?${query.toString()}`;
}

async function readResponseTextLimited(response, maxBytes) {
  if (Number.isFinite(Number(response.headers.get('content-length'))) &&
      Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error('Storage response exceeded the configured size limit');
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error('Storage response exceeded the configured size limit');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      text += decoder.decode();
      break;
    }
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error('Storage response exceeded the configured size limit');
    }
    text += decoder.decode(value, { stream: true });
  }

  return text;
}

export async function readJsonWithStatus(key) {
  if (!storageReady) return { ok: false, found: false, value: null, reason: 'storage_not_configured' };
  try {
    const response = await storageFetch(presign('GET', key, 900), {}, STORAGE_READ_TIMEOUT_MS);
    if (response.status === 404) return { ok: true, found: false, value: null, reason: 'not_found' };
    if (!response.ok) return { ok: false, found: false, value: null, reason: `http_${response.status}` };
    const body = await readResponseTextLimited(response, MAX_JSON_RESPONSE_BYTES);
    return { ok: true, found: true, value: JSON.parse(body), reason: 'ok' };
  } catch (error) {
    console.error(`Storage read failed for ${key}:`, error);
    return { ok: false, found: false, value: null, reason: 'read_failed' };
  }
}

export async function readJson(key, fallback = null) {
  const result = await readJsonWithStatus(key);
  return result.ok && result.found ? result.value : fallback;
}

export async function writeJson(key, value) {
  if (!storageReady) return false;
  try {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body, 'utf8') > MAX_JSON_REQUEST_BYTES) {
      throw new Error('Storage request exceeded the configured size limit');
    }
    const response = await storageFetch(presign('PUT', key, 900), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body
    }, STORAGE_WRITE_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Storage write returned ${response.status}`);
    return true;
  } catch (error) {
    console.error(`Storage write failed for ${key}:`, error);
    return false;
  }
}

export async function deleteObject(key) {
  if (!storageReady || !key) return true;
  try {
    const response = await storageFetch(presign('DELETE', key, 900), { method: 'DELETE' }, STORAGE_WRITE_TIMEOUT_MS);
    if (!response.ok && response.status !== 404) throw new Error(`Storage delete returned ${response.status}`);
    return true;
  } catch (error) {
    console.error(`Storage delete failed for ${key}:`, error);
    return false;
  }
}
