import test from 'node:test';
import assert from 'node:assert/strict';
import { createShamsWorkflowService } from '../apps/web/services/shams-workflow-service.js';

function memoryFixture() {
  let value = {
    name: 'أحمد',
    preferences: {},
    recentProducts: [],
    pendingAction: null,
    journey: {}
  };
  return {
    async read() { return structuredClone(value); },
    async save(_identity, patch = {}) {
      value = { ...value, ...patch };
      return structuredClone(value);
    },
    async rememberTurn() { return structuredClone(value); }
  };
}

test('reservation workflow accepts Arabic-Indic phone, guest count, and half-hour time', async () => {
  const memoryService = memoryFixture();
  const service = createShamsWorkflowService({
    memoryService,
    getReservationService: () => ({ createReservation: async data => ({ id: 'R1', date: data.date, time: data.time }) }),
    getOrderService: () => ({})
  });

  const result = await service.handleReservation({
    identity: { sessionId: 's1' },
    message: 'احجزلي بكرة الساعة ٨ ونص مساءً لـ ٤ أشخاص، رقمي ٠٥٠٠٠٠٠٠٠٠'
  });

  assert.equal(result.status, 'awaiting_confirmation');
  assert.equal(result.pending.guests, 4);
  assert.equal(result.pending.time, '20:30');
  assert.equal(result.pending.phone, '+971500000000');
  assert.match(result.pending.date, /^20\d{2}-\d{2}-\d{2}$/);
});

test('reservation workflow carries slots across turns', async () => {
  const memoryService = memoryFixture();
  const service = createShamsWorkflowService({
    memoryService,
    getReservationService: () => ({ createReservation: async data => ({ id: 'R2', date: data.date, time: data.time }) }),
    getOrderService: () => ({})
  });

  const first = await service.handleReservation({
    identity: { sessionId: 's2' },
    message: 'عايز احجز بكرة الساعة ٧ مساءً لشخصين'
  });
  assert.equal(first.status, 'needs_input');
  assert.equal(first.pending.guests, 2);
  assert.equal(first.pending.time, '19:00');

  const second = await service.handleReservation({
    identity: { sessionId: 's2' },
    message: 'رقمي ٠٥٠٠٠٠٠٠٠٠'
  });
  assert.equal(second.status, 'needs_input');
  assert.equal(second.pending.phone, '+971500000000');
  assert.equal(second.pending.date, first.pending.date);
  assert.equal(second.pending.time, first.pending.time);
});
