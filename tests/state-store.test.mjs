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

test('state store fails closed when snapshot storage cannot be read', async () => {
  let writes = 0;
  const state = {
    products: [{ id: 'P001' }],
    customers: [],
    orders: [],
    reservations: []
  };
  const store = createStateStore({
    readJsonWithStatus: async () => ({ ok: false, found: false, value: null, reason: 'read_failed' }),
    writeJson: async () => { writes += 1; return true; },
    storageReady: true,
    stateKey: 'data/test-state.json',
    menuVersion: 'test',
    ...state
  });

  await assert.rejects(() => store.restore(), /could not be restored/i);
  assert.equal(store.status().restoreStatus, 'restore_failed');
  assert.equal(store.status().lastPersistOk, false);
  await store.flush();
  assert.equal(writes, 0);
});
