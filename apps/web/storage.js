import crypto from 'node:crypto';

const env = (name) => process.env[name] || '';
const endpoint = String(env('AWS_ENDPOINT_URL') || 'https://t3.storageapi.dev').replace(/\/$/, '');
const region = String(env('AWS_DEFAULT_REGION') || 'auto');
const bucket = String(env('AWS_S3_BUCKET_NAME') || '').trim();
const accessKey = String(env('AWS_' + 'ACCESS_KEY_ID') || '').trim();
const secretKey = String(env('AWS_' + 'SECRET_' + 'ACCESS_KEY') || '').trim();

export const storageReady = Boolean(bucket && accessKey && secretKey);

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
  if (!storageReady) throw new Error('Video storage is not configured');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const credential = `${accessKey}/${date}/${region}/s3/aws4_request`;
  const host = new URL(endpoint).host;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host'
  });
  const canonicalQuery = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encode(k)}=${encode(v)}`).join('&');
  const canonicalRequest = [method, uri(key), canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  query.set('X-Amz-Signature', hmac(signingKey(date), stringToSign, 'hex'));
  return `${endpoint}${uri(key)}?${query.toString()}`;
}
