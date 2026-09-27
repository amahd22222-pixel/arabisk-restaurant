import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  createSign,
  randomBytes
} from 'node:crypto';

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function hkdfExpand(prk, info, length) {
  const output = [];
  let previous = Buffer.alloc(0);
  for (let counter = 1; Buffer.concat(output).length < length; counter += 1) {
    previous = createHmac('sha256', prk)
      .update(Buffer.concat([previous, Buffer.from(info), Buffer.from([counter])]))
      .digest();
    output.push(previous);
  }
  return Buffer.concat(output).subarray(0, length);
}

function hkdfExtract(salt, ikm) {
  return createHmac('sha256', salt).update(ikm).digest();
}

function derIntegerToFixed32(value) {
  let result = Buffer.from(value);
  while (result.length > 32 && result[0] === 0) result = result.subarray(1);
  if (result.length > 32) throw new Error('Invalid ECDSA signature component.');
  if (result.length === 32) return result;
  return Buffer.concat([Buffer.alloc(32 - result.length), result]);
}

function derSignatureToJose(signature) {
  const der = Buffer.from(signature);
  if (der[0] !== 0x30) throw new Error('Invalid ECDSA signature.');
  let offset = 1;
  const readLength = () => {
    const first = der[offset++];
    if (!(first & 0x80)) return first;
    const bytes = first & 0x7f;
    if (!bytes || bytes > 2) throw new Error('Invalid DER length.');
    let length = 0;
    for (let index = 0; index < bytes; index += 1) length = (length << 8) | der[offset++];
    return length;
  };
  const sequenceLength = readLength();
  if (sequenceLength !== der.length - offset) throw new Error('Invalid DER sequence length.');
  if (der[offset++] !== 0x02) throw new Error('Invalid DER r component.');
  const rLength = readLength();
  const r = der.subarray(offset, offset + rLength);
  offset += rLength;
  if (der[offset++] !== 0x02) throw new Error('Invalid DER s component.');
  const sLength = readLength();
  const s = der.subarray(offset, offset + sLength);
  if (offset + sLength !== der.length) throw new Error('Invalid DER signature tail.');
  return Buffer.concat([derIntegerToFixed32(r), derIntegerToFixed32(s)]);
}

function createVapidKey(privateKeyValue, publicKeyValue) {
  const privateKey = base64UrlDecode(privateKeyValue);
  const publicKey = base64UrlDecode(publicKeyValue);
  if (privateKey.length !== 32 || publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('Invalid VAPID key format.');
  }
  return {
    publicKey,
    privateKeyObject: createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        d: base64UrlEncode(privateKey),
        x: base64UrlEncode(publicKey.subarray(1, 33)),
        y: base64UrlEncode(publicKey.subarray(33, 65))
      },
      format: 'jwk'
    })
  };
}

function createVapidAuthorization({ endpoint, subject, privateKeyValue, publicKeyValue }) {
  const vapid = createVapidKey(privateKeyValue, publicKeyValue);
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: text(subject, 200)
  }));
  const signingInput = Buffer.from(`${header}.${payload}`);
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = derSignatureToJose(signer.sign(vapid.privateKeyObject));
  return `vapid t=${header}.${payload}.${base64UrlEncode(signature)}, k=${base64UrlEncode(vapid.publicKey)}`;
}

function createReceiverPublicKey(raw) {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('Invalid push receiver public key.');
  const spkiPrefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
  return Buffer.concat([spkiPrefix, raw]);
}

function encryptPayload(subscription, payload) {
  const receiverPublicKey = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  if (authSecret.length !== 16) throw new Error('Invalid push authentication secret.');

  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const senderPublicKey = ecdh.getPublicKey(null, 'uncompressed');
  const sharedSecret = ecdh.computeSecret(createReceiverPublicKey(receiverPublicKey));

  const authInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receiverPublicKey,
    senderPublicKey
  ]);
  const prkKey = hkdfExtract(authSecret, sharedSecret);
  const ikm = hkdfExpand(prkKey, authInfo, 32);

  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);

  const encodedPayload = Buffer.from(JSON.stringify(payload));
  const record = Buffer.concat([encodedPayload, Buffer.from([0x02])]);
  const recordSize = 4096;
  if (record.length + 16 > recordSize) throw new Error('Notification payload is too large.');

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21 + senderPublicKey.length);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(senderPublicKey.length, 20);
  senderPublicKey.copy(header, 21);
  return Buffer.concat([header, ciphertext]);
}

export function createWebPushService({
  privateKey,
  publicKey,
  subject,
  fetchImpl = globalThis.fetch
}) {
  const configured = Boolean(privateKey && publicKey && subject);
  const send = async (subscription, payload, { ttl = 86400, urgency = 'normal', topic = '' } = {}) => {
    if (!configured) throw new Error('Web Push VAPID credentials are not configured.');
    if (!fetchImpl) throw new Error('Fetch is not available in this runtime.');

    const endpoint = text(subscription?.endpoint, 500);
    const p256dh = text(subscription?.p256dh, 200);
    const auth = text(subscription?.auth, 100);
    if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) {
      throw new Error('Invalid push subscription.');
    }

    const body = encryptPayload({ p256dh, auth }, payload);
    const headers = {
      Authorization: createVapidAuthorization({
        endpoint,
        subject,
        privateKeyValue: privateKey,
        publicKeyValue: publicKey
      }),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(Math.max(60, Math.min(2_419_200, Number(ttl) || 86400))),
      Urgency: ['very-low', 'low', 'normal', 'high'].includes(urgency) ? urgency : 'normal'
    };
    if (/^[A-Za-z0-9_-]{1,32}$/.test(topic)) headers.Topic = topic;

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'error'
    });
    const responseBody = await response.text().catch(() => '');
    return {
      ok: response.ok,
      statusCode: response.status,
      body: responseBody.slice(0, 300)
    };
  };

  return {
    configured,
    send
  };
}
