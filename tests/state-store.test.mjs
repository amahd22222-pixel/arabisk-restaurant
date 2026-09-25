import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore } from '../apps/web/repositories/state-store.js';

test('state store exposes lifecycle operations, not internal collections', async () => {
  const state = {
    products: [{ id: 'P001' }],
    customers: [],
    orders: [],
    reservations: []
  };

  const store = createStateStore({
    readJson: async () => null,
    writeJson: async () => true,
    storageReady: false,
    stateKey: 'data/test-state.json',
    menuVersion: 'test',
    ...state
  });

  assert.deepEqual(Object.keys(store).sort(), ['flush', 'persist', 'restore', 'status']);
  assert.equal(store.products, undefined);
  assert.equal(store.orders, undefined);

  await store.restore();
  assert.equal(store.status().restoreStatus, 'storage_not_configured');
});
