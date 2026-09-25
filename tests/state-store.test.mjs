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


test('state store persist resolves after the actual storage write completes', async () => {
  let releaseWrite;
  let started = false;
  const writeDone = new Promise(resolve => { releaseWrite = resolve; });
  const store = createStateStore({
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => {
      started = true;
      await writeDone;
      return true;
    },
    storageReady: true,
    stateKey: 'data/test-state.json',
    menuVersion: 'test',
    products: [],
    customers: [],
    orders: [],
    reservations: []
  });

  await store.restore();
  const persistence = store.persist();
  const flush = store.flush();

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, true);

  let settled = false;
  persistence.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);

  releaseWrite();
  assert.equal(await persistence, true);
  assert.equal(await flush, true);
  assert.equal(store.status().lastPersistOk, true);
});

test('state store persist reports a failed storage write', async () => {
  const store = createStateStore({
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => false,
    storageReady: true,
    stateKey: 'data/test-state.json',
    menuVersion: 'test',
    products: [],
    customers: [],
    orders: [],
    reservations: []
  });

  await store.restore();
  const persistence = store.persist();
  await store.flush();

  assert.equal(await persistence, false);
  assert.equal(store.status().lastPersistOk, false);
});


test('state store binds each persistence promise to its own queued write', async () => {
  let resolveFirst;
  let writes = 0;
  const firstWrite = new Promise(resolve => { resolveFirst = resolve; });
  const store = createStateStore({
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async (_key, snapshot) => {
      writes += 1;
      if (writes === 1) {
        await firstWrite;
      }
      return true;
    },
    storageReady: true,
    stateKey: 'data/test-state.json',
    menuVersion: 'test',
    products: [],
    customers: [],
    orders: [],
    reservations: []
  });

  await store.restore();
  const first = store.persist();
  await new Promise(resolve => setTimeout(resolve, 0));
  store.flush();

  const second = store.persist();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(writes, 1);

  resolveFirst();
  assert.equal(await first, true);
  assert.equal(await new Promise(resolve => setImmediate(() => resolve(writes))), 1);

  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(writes, 2);
  assert.equal(await second, true);
});
