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
  const experiences = [{
    id: 'E001',
    slug: 'chef-night',
    titleAr: 'ليلة الشيف',
    titleEn: 'Chef Night',
    startsAt: '2099-01-01T10:00:00.000Z',
    endsAt: '',
    status: 'published',
    bookingEnabled: true,
    coverImageUrl: '',
    coverImageKey: 'experiences/E001/old.webp',
    videoUrl: '',
    videoKey: ''
  }];
  const events = [];
  const service = createExperienceService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });
  await service.update('E001', { coverImageKey: 'experiences/E001/new.webp' });

  assert.deepEqual(events, ['write', 'delete:experiences/E001/old.webp']);
  assert.equal(experiences[0].coverImageKey, 'experiences/E001/new.webp');
});

test('experience media update rolls back without deleting the old media when persistence fails', async () => {
  const experiences = [{
    id: 'E001',
    slug: 'chef-night',
    titleAr: 'ليلة الشيف',
    titleEn: 'Chef Night',
    startsAt: '2099-01-01T10:00:00.000Z',
    endsAt: '',
    status: 'published',
    bookingEnabled: true,
    coverImageUrl: '',
    coverImageKey: 'experiences/E001/old.webp',
    videoUrl: '',
    videoKey: ''
  }];
  const deleted = [];
  const service = createExperienceService({
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => false,
    deleteObject: async key => { deleted.push(key); return true; },
    isAdminApiKeyValid: () => true
  });

  await assert.rejects(
    () => service.update('E001', { coverImageKey: 'experiences/E001/new.webp' }),
    /persisted to storage/i
  );

  assert.equal(experiences[0].coverImageKey, 'experiences/E001/old.webp');
  assert.deepEqual(deleted, []);
});

test('experience removal persists before deleting its media', async () => {
  const experiences = [{
    id: 'E001',
    slug: 'chef-night',
    titleAr: 'ليلة الشيف',
    titleEn: 'Chef Night',
    startsAt: '2099-01-01T10:00:00.000Z',
    endsAt: '',
    status: 'published',
    bookingEnabled: true,
    coverImageUrl: '',
    coverImageKey: 'experiences/E001/old.webp',
    videoUrl: '',
    videoKey: ''
  }];
  const events = [];
  const service = createExperienceService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => { events.push('write'); return true; },
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true
  });

  await service.remove('E001');

  assert.deepEqual(events, ['write', 'delete:experiences/E001/old.webp']);
  assert.equal(experiences.length, 0);
});
