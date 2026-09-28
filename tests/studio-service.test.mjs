import test from 'node:test';
import assert from 'node:assert/strict';

import { createStudioService } from '../apps/web/services/studio-service.js';

const makeService = ({ writeResult = true, deleted = [] } = {}) => {
  const writes = [];
  const service = createStudioService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    writeJson: async (_key, value) => {
      writes.push(structuredClone(value));
      return writeResult;
    },
    deleteObject: async key => {
      deleted.push(key);
      return true;
    }
  });
  return { service, writes, deleted };
};

test('studio media replacement persists new key before deleting old media', async () => {
  const deleted = [];
  const { service, writes } = makeService({ deleted });

  await service.create({ title: 'Main', sortOrder: 1 });
  await service.update('S001', { desktopVideoKey: 'studio/S001/desktop/old.mp4' });

  const beforeWrites = writes.length;
  await service.update('S001', { desktopVideoKey: 'studio/S001/desktop/new.mp4' });

  assert.equal(writes.length, beforeWrites + 1);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0], 'studio/S001/desktop/old.mp4');
  assert.equal(service.get('S001').desktopVideoUrl, 'https://signed.example/GET/studio/S001/desktop/new.mp4');
});

test('studio update rolls back in-memory state when persistence fails', async () => {
  const deleted = [];
  let writes = 0;
  const service = createStudioService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    writeJson: async () => {
      writes += 1;
      return writes < 3;
    },
    deleteObject: async key => {
      deleted.push(key);
      return true;
    }
  });

  await service.create({ title: 'Main', sortOrder: 1 });
  await service.update('S001', { desktopVideoKey: 'studio/S001/desktop/old.mp4' });

  await assert.rejects(
    () => service.update('S001', {
      title: 'Changed',
      desktopVideoKey: 'studio/S001/desktop/new.mp4'
    }),
    /persisted to storage/i
  );

  assert.equal(service.get('S001').title, 'Main');
  assert.equal(service.get('S001').desktopVideoUrl, 'https://signed.example/GET/studio/S001/desktop/old.mp4');
  assert.equal(deleted.length, 0);
});

test('studio remove restores the item when persistence fails', async () => {
  let failNextSave = false;
  const deleted = [];
  const service = createStudioService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    writeJson: async () => !failNextSave,
    deleteObject: async key => {
      deleted.push(key);
      return true;
    }
  });

  await service.create({ title: 'Main', sortOrder: 1 });
  await service.update('S001', { desktopVideoKey: 'studio/S001/desktop/current.mp4' });

  failNextSave = true;
  await assert.rejects(
    () => service.remove('S001'),
    /persisted to storage/i
  );

  assert.equal(service.get('S001').id, 'S001');
  assert.equal(deleted.length, 0);
});
