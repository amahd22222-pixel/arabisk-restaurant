import test from 'node:test';
import assert from 'node:assert/strict';
import { createShamsMemoryService } from '../apps/web/services/shams-memory-service.js';

test('Shams merges anonymous conversational context into customer memory without carrying pending actions', async () => {
  const store = new Map();
  const memory = createShamsMemoryService({
    async readJsonWithStatus(key) {
      return store.has(key) ? { ok: true, found: true, value: store.get(key) } : { ok: true, found: false };
    },
    async writeJson(key, value) {
      store.set(key, value);
      return true;
    }
  });

  await memory.rememberTurn(
    { sessionId: 'session-123' },
    {
      user: 'عايز طبق دجاج حار',
      assistant: 'أكيد، هرشح لك اختيارات مناسبة.',
      intent: 'recommend',
      journey: { stage: 'orientation', nextBestAction: 'personalized_recommendation' },
      name: 'أحمد'
    }
  );

  await memory.save(
    { customerId: 'C-123' },
    {
      name: 'أحمد',
      pendingAction: {
        type: 'reservation',
        data: { date: '2026-09-30', time: '20:00' },
        idempotencyKey: 'keep-me',
        expiresAt: Date.now() + 600000
      }
    }
  );

  const merged = await memory.mergeSessionIntoCustomer('session-123', 'C-123');
  assert.equal(merged, true);

  const result = await memory.read({ customerId: 'C-123' });
  assert.equal(result.name, 'أحمد');
  assert.match(result.recentTurns.map(item => item.content).join(' '), /دجاج/);
  assert.equal(result.preferences.spicy, true);
  assert.equal(result.pendingAction?.type, 'reservation');
  assert.equal(result.pendingAction?.idempotencyKey, 'keep-me');
  assert.equal(result.journey.stage, 'orientation');

  await memory.mergeSessionIntoCustomer('session-123', 'C-123');
  const afterRetry = await memory.read({ customerId: 'C-123' });
  assert.equal(afterRetry.recentTurns.length, result.recentTurns.length);

  const sessionAfterMigration = await memory.read({ sessionId: 'session-123' });
  assert.equal(sessionAfterMigration.migratedToCustomerId, 'C-123');
  assert.ok(sessionAfterMigration.migratedAt);
});
