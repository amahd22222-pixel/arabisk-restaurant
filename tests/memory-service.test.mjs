import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryService } from '../apps/web/services/memory-service.js';

function createService(limits) {
  return createMemoryService({
    storageReady: false,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => true,
    deleteObject: async () => true,
    limits
  });
}

test('memory service enforces bounded community growth', async () => {
  const service = createService({
    maxMemories: 1,
    maxCommentsPerMemory: 1,
    maxReportsPerMemory: 1
  });

  const memory = await service.create({ text: 'ذكرى أولى', displayName: 'زائر' });

  await assert.rejects(
    () => service.create({ text: 'ذكرى ثانية', displayName: 'زائر آخر' }),
    error => error.status === 503
  );

  await service.comment(memory.id, { text: 'تعليق واحد', displayName: 'مستخدم' });

  await assert.rejects(
    () => service.comment(memory.id, { text: 'تعليق ثانٍ', displayName: 'مستخدم آخر' }),
    error => error.status === 409
  );

  await service.report(memory.id, { reason: 'بلاغ واحد' });

  await assert.rejects(
    () => service.report(memory.id, { reason: 'بلاغ ثانٍ' }),
    error => error.status === 409
  );
});
