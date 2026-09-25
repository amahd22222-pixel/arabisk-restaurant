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


test('memory creation rolls back when persistence fails', async () => {
  const memories = [];
  const service = createMemoryService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => false,
    deleteObject: async () => true
  });

  await assert.rejects(
    () => service.create({ text: 'لن تُحفظ' }),
    /persisted to storage/i
  );

  assert.deepEqual(service.list({}).items, []);
  assert.equal(memories.length, 0);
});

test('memory mutation rolls back when persistence fails', async () => {
  let failSave = false;
  const service = createMemoryService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => !failSave,
    deleteObject: async () => true
  });

  const memory = await service.create({ text: 'النص الأصلي' });
  failSave = true;

  await assert.rejects(
    () => service.adminUpdate(memory.id, { text: 'النص المعدل' }),
    /persisted to storage/i
  );

  assert.equal(service.get ? 'available' : 'hidden', 'available');
  assert.equal(service.list({}).items[0].text, 'النص الأصلي');
});

test('memory deletion persists before deleting media', async () => {
  let failSave = false;
  const events = [];
  const service = createMemoryService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return !failSave; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; }
  });

  const memory = await service.create({
    text: 'ذكرى',
    imageKey: 'memories/image.webp'
  });
  events.length = 0;

  await service.adminDelete(memory.id);

  assert.deepEqual(events, ['write', 'delete:memories/image.webp']);
});

test('memory deletion restores the item and keeps media when persistence fails', async () => {
  let failSave = false;
  const deleted = [];
  const service = createMemoryService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => !failSave,
    deleteObject: async key => { deleted.push(key); return true; }
  });

  const memory = await service.create({
    text: 'ذكرى',
    imageKey: 'memories/image.webp'
  });
  failSave = true;

  await assert.rejects(
    () => service.adminDelete(memory.id),
    /persisted to storage/i
  );

  assert.equal(service.list({}).items.length, 1);
  assert.equal(deleted.length, 0);
});
