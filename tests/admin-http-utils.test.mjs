import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../apps/admin/http-utils.js';

test('same-origin guard accepts the admin origin', () => {
  assert.equal(isSameOriginRequest({
    headers: {
      origin: 'https://admin.example.com',
      host: 'admin.example.com',
      'x-forwarded-proto': 'https'
    }
  }), true);
});

test('same-origin guard rejects a different origin', () => {
  assert.equal(isSameOriginRequest({
    headers: {
      origin: 'https://attacker.example',
      host: 'admin.example.com',
      'x-forwarded-proto': 'https'
    }
  }), false);
});

test('same-origin guard accepts requests without an Origin header', () => {
  assert.equal(isSameOriginRequest({
    headers: {
      host: 'admin.example.com',
      'x-forwarded-proto': 'https'
    }
  }), true);
});

test('same-origin guard supports local development', () => {
  assert.equal(isSameOriginRequest({
    headers: {
      origin: 'http://localhost:4174',
      host: 'localhost:4174',
      'x-forwarded-proto': 'http'
    }
  }), true);
});
