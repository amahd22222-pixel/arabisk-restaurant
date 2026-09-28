import test from 'node:test';
import assert from 'node:assert/strict';
import { createShamsMemoryService } from '../apps/web/services/shams-memory-service.js';

test('Shams promotes repeated non-sensitive preferences from temporary to stable', async () => {
  const memory = createShamsMemoryService({
    async readJsonWithStatus() { return { ok: true, found: false }; },
    async writeJson() { return true; }
  });

  const first = memory.learnPreferences(
    { spicy: null, vegetarian: null, taste: null, weight: null, category: '', protein: null },
    {},
    { spicy: true }
  );
  assert.equal(first.preferences.spicy, null);
  assert.equal(first.preferenceConfidence.spicy, 0.5);

  const second = memory.learnPreferences(
    first.preferences,
    first.preferenceEvidence,
    { spicy: true }
  );
  assert.equal(second.preferences.spicy, true);
  assert.equal(second.preferenceConfidence.spicy, 1);
});

test('Shams lets a repeated opposite preference eventually replace the earlier signal', async () => {
  const memory = createShamsMemoryService({
    async readJsonWithStatus() { return { ok: true, found: false }; },
    async writeJson() { return true; }
  });

  const first = memory.learnPreferences(
    { spicy: null, vegetarian: null, taste: null, weight: null, category: '', protein: null },
    {},
    { spicy: true }
  );
  const second = memory.learnPreferences(
    first.preferences,
    first.preferenceEvidence,
    { spicy: false }
  );
  const third = memory.learnPreferences(
    second.preferences,
    second.preferenceEvidence,
    { spicy: false }
  );

  assert.equal(second.preferences.spicy, true);
  assert.equal(second.preferenceConfidence.spicy, 0.5);
  assert.equal(third.preferences.spicy, false);
  assert.equal(third.preferenceConfidence.spicy, 1);
});

test('Shams maps a rejection to the ordered recommendation list instead of the latest recent product', async () => {
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

  await memory.save({ customerId: 'C-ORDERED' }, {
    recentProducts: [{ id: 'P3', nameAr: 'آخر طبق', price: 80 }],
    lastRecommendation: [
      { id: 'P1', nameAr: 'الاختيار الأول', price: 70 },
      { id: 'P2', nameAr: 'الاختيار الثاني', price: 75 },
      { id: 'P3', nameAr: 'الاختيار الثالث', price: 80 }
    ]
  });

  await memory.rememberTurn(
    { customerId: 'C-ORDERED' },
    { user: 'مش ده', assistant: 'تمام، أختار لك غيره.', intent: 'recommend' }
  );
  const saved = await memory.read({ customerId: 'C-ORDERED' });
  assert.equal(saved.avoidProducts?.[0]?.id, 'P1');
});
 
test('Shams remembers explicit rejection of the latest product for future recommendations', async () => {
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

  await memory.save({ customerId: 'C-REJECT' }, {
    recentProducts: [{ id: 'P1', nameAr: 'طبق لا أريده', price: 70 }]
  });
  await memory.rememberTurn(
    { customerId: 'C-REJECT' },
    { user: 'مش ده، مش بحبه', assistant: 'تمام، أختار لك غيره.', intent: 'recommend' }
  );

  const saved = await memory.read({ customerId: 'C-REJECT' });
  assert.equal(saved.avoidProducts?.[0]?.id, 'P1');
  assert.equal(saved.avoidProducts?.[0]?.count, 1);
});

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
