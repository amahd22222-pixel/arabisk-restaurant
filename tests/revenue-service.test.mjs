import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevenueService } from '../apps/web/services/revenue-service.js';

test('revenue summary builds without leaking ranking scope', () => {
  const service = createRevenueService({
    readJson: async () => null,
    writeJson: async () => {},
    storageReady: false,
    customers: [],
    reservations: [],
    orders: [],
    products: []
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
