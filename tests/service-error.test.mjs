import test from 'node:test';
import assert from 'node:assert/strict';
import { sendServiceError, logServiceFailure } from '../apps/web/utils/service-error.js';

test('service error helper hides internal server messages', () => {
  const responses = [];
  const res = {
    locals: { requestId: 'test-request' },
    status(code) {
      responses.push({ code });
      return this;
    },
    json(payload) {
      responses[responses.length - 1].payload = payload;
      return payload;
    }
  };

  sendServiceError(res, Object.assign(new Error('database secret'), { status: 500 }));
  assert.equal(responses[0].code, 500);
  assert.equal(responses[0].payload.message, 'Internal server error.');
  assert.equal(responses[0].payload.code, undefined);

  sendServiceError(res, Object.assign(new Error('Product not found'), {
    status: 404,
    code: 'PRODUCT_NOT_FOUND',
    meta: { id: 'P001' }
  }));
  assert.equal(responses[1].code, 404);
  assert.equal(responses[1].payload.message, 'Product not found');
  assert.equal(responses[1].payload.code, 'PRODUCT_NOT_FOUND');
  assert.equal(responses[1].payload.id, 'P001');
});

test('service error helper only exposes allowlisted public metadata', () => {
  const responses = [];
  const res = {
    locals: { requestId: 'meta-request' },
    status(code) {
      responses.push({ code });
      return this;
    },
    json(payload) {
      responses[responses.length - 1].payload = payload;
      return payload;
    }
  };

  sendServiceError(res, Object.assign(new Error('invalid request'), {
    status: 400,
    meta: {
      id: 'P001',
      reservationId: 'R001',
      secret: 'do-not-expose',
      internalToken: 'hidden'
    }
  }));

  assert.equal(responses[0].payload.id, 'P001');
  assert.equal(responses[0].payload.reservationId, 'R001');
  assert.equal(responses[0].payload.secret, undefined);
  assert.equal(responses[0].payload.internalToken, undefined);
});


test('service failure logger redacts sensitive values and emits structured metadata', () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args.join(' '));
  try {
    logServiceFailure(new Error('token=secret-value password=hunter2'), {
      service: 'memory',
      operation: 'upload'
    });
  } finally {
    console.error = original;
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0], /"event":"service_failure"/);
  assert.match(calls[0], /"service":"memory"/);
  assert.match(calls[0], /"operation":"upload"/);
  assert.match(calls[0], /token=\[REDACTED\]/);
  assert.match(calls[0], /password=\[REDACTED\]/);
  assert.doesNotMatch(calls[0], /secret-value|hunter2/);
});
