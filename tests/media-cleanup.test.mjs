import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoryService } from '../apps/web/services/category-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';
import { createExperienceService } from '../apps/web/services/experience-service.js';

test('category media replacement persists before deleting the old image', async () => {
  const categories = [{
    id: 'C001',
    nameAr: 'أولى',
    nameEn: 'First',
    imageUrl: '',
    imageKey: 'categories/C001/old.webp',
    sortOrder: 1,
    active: true
  }];
  const events = [];
  const service = createCategoryService({
    categoriesRepository: createCollectionRepository(categories),
    productsRepository: createCollectionRepository([]),
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });

  await service.update('C001', { imageKey: 'categories/C001/new.webp' });

  assert.deepEqual(events, ['write', 'delete:categories/C001/old.webp']);
  assert.equal(categories[0].imageKey, 'categories/C001/new.webp');
});

test('category media update rolls back without deleting the old image when persistence fails', async () => {
  const categories = [{
    id: 'C001',
    nameAr: 'أولى',
    nameEn: 'First',
    imageUrl: '',
    imageKey: 'categories/C001/old.webp',
    sortOrder: 1,
    active: true
  }];
  const deleted = [];
  const service = createCategoryService({
    categoriesRepository: createCollectionRepository(categories),
    productsRepository: createCollectionRepository([]),
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => false,
    deleteObject: async key => { deleted.push(key); return true; },
    isAdminApiKeyValid: () => true
  });

  await assert.rejects(
    () => service.update('C001', { imageKey: 'categories/C001/new.webp' }),
    /persisted to storage/i
  );

  assert.equal(categories[0].imageKey, 'categories/C001/old.webp');
  assert.deepEqual(deleted, []);
});

test('category removal persists before deleting its image', async () => {
  const categories = [{
    id: 'C001',
    nameAr: 'أولى',
    nameEn: 'First',
    imageUrl: '',
    imageKey: 'categories/C001/old.webp',
    sortOrder: 1,
    active: true
  }];
  const events = [];
  const service = createCategoryService({
    categoriesRepository: createCollectionRepository(categories),
    productsRepository: createCollectionRepository([]),
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });

  await service.remove('C001');

  assert.deepEqual(events, ['write', 'delete:categories/C001/old.webp']);
  assert.equal(categories.length, 0);
});

test('experience media replacement persists before deleting the old media', async () => {
  const events = [];
  const service = createExperienceService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });

  const created = await service.create({
    slug: 'cleanup-experience-' + Date.now(),
    titleAr: 'تجربة',
    titleEn: 'Cleanup test',
    startsAt: '2099-01-01T10:00:00.000Z',
    status: 'published',
    coverImageKey: 'experiences/old.webp'
  });
  events.length = 0;

  await service.update(created.id, { coverImageKey: 'experiences/new.webp' });

  assert.deepEqual(events, ['write', 'delete:experiences/old.webp']);
  assert.equal(
    service.get(created.id).coverImageUrl,
    'https://signed.example/GET/experiences/new.webp'
  );
});

test('experience media update rolls back without deleting the old media when persistence fails', async () => {
  let failNext = false;
  const deleted = [];
  const service = createExperienceService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => !failNext,
    deleteObject: async key => { deleted.push(key); return true; },
    isAdminApiKeyValid: () => true
  });

  const created = await service.create({
    slug: 'rollback-experience-' + Date.now(),
    titleAr: 'تجربة',
    titleEn: 'Rollback test',
    startsAt: '2099-01-01T10:00:00.000Z',
    status: 'published',
    coverImageKey: 'experiences/old.webp'
  });
  await service.update(created.id, { titleAr: 'قبل الفشل' });

  failNext = true;
  await assert.rejects(
    () => service.update(created.id, {
      titleAr: 'بعد الفشل',
      coverImageKey: 'experiences/new.webp'
    }),
    /persisted to storage/i
  );

  assert.equal(service.get(created.id).titleAr, 'قبل الفشل');
  assert.equal(
    service.get(created.id).coverImageUrl,
    'https://signed.example/GET/experiences/old.webp'
  );
  assert.deepEqual(deleted, []);
});

test('experience removal persists before deleting its media', async () => {
  const events = [];
  const service = createExperienceService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });

  const created = await service.create({
    slug: 'remove-experience-' + Date.now(),
    titleAr: 'تجربة',
    titleEn: 'Remove test',
    startsAt: '2099-01-01T10:00:00.000Z',
    status: 'published',
    coverImageKey: 'experiences/remove.webp'
  });
  events.length = 0;

  await service.remove(created.id);

  assert.deepEqual(events, ['write', 'delete:experiences/remove.webp']);
  assert.throws(() => service.get(created.id), /Experience not found/);
});
