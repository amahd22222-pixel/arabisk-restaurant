import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevenueService } from '../apps/web/services/revenue-service.js';
import { createStateRepository } from '../apps/web/repositories/state-repository.js';

test('revenue summary builds without leaking ranking scope', () => {
  const repository = createStateRepository({
    products: [],
    categories: [],
    orders: [],
    customers: [],
    reservations: [],
    persist: async () => {}
  });

  const service = createRevenueService({
    readJson: async () => null,
    writeJson: async () => {},
    storageReady: false,
    repository
  });

  service.recordEvent({
    eventName: 'menu_view',
    sessionId: 'summary-smoke-session'
  });

  const summary = service.buildSummary();

  assert.ok(summary);
  assert.ok(Array.isArray(summary.topActions));
  assert.ok(Array.isArray(summary.intelligence?.nextActions));
  assert.ok(summary.campaigns);
});


test('revenue persistence rejects when storage reports a failed write', async () => {
  const repository = createStateRepository({
    products: [],
    categories: [],
    orders: [],
    customers: [],
    reservations: [],
    persist: async () => {}
  });

  const service = createRevenueService({
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    writeJson: async () => false,
    storageReady: true,
    repository
  });

  service.recordEvent({
    eventName: 'menu_view',
    sessionId: 'persistence-failure-session'
  });

  await assert.rejects(
    () => service.flushPersistRevenue(),
    /Revenue state could not be persisted to storage/i
  );
});
