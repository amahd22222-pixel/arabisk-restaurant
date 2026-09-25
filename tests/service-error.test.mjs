import test from 'node:test';
import assert from 'node:assert/strict';
import { sendServiceError } from '../apps/web/utils/service-error.js';

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
