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
