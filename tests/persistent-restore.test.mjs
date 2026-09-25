import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoryService } from '../apps/web/services/category-service.js';
import { createStudioService } from '../apps/web/services/studio-service.js';
import { createExperienceService } from '../apps/web/services/experience-service.js';
import { createMemoryService } from '../apps/web/services/memory-service.js';
import { createRevenueService } from '../apps/web/services/revenue-service.js';

const failingReader = async () => ({
  ok: false,
  found: false,
  value: null,
  reason: 'read_failed'
});

const noop = async () => true;

const categoryRepository = () => ({
  all: () => [],
  find: () => undefined,
  filter: () => [],
  some: () => false,
  replaceAll: () => []
});

const revenueRepository = {
  customers: { find: () => undefined },
  products: { find: () => undefined },
  reservations: { find: () => undefined, filter: () => [] },
  orders: { filter: () => [] }
};

test('persistent domain restores fail closed on category storage read errors', async () => {
  const service = createCategoryService({
    categoriesRepository: categoryRepository(),
    productsRepository: { filter: () => [] },
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: failingReader,
    writeJson: noop,
    deleteObject: noop,
    isAdminApiKeyValid: () => false
  });

  await assert.rejects(service.restore, /Category state could not be restored from storage/i);
});

test('persistent domain restores fail closed on studio storage read errors', async () => {
  const service = createStudioService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: failingReader,
    writeJson: noop,
    deleteObject: noop
  });

  await assert.rejects(service.restore, /Studio state could not be restored from storage/i);
});

test('persistent domain restores fail closed on experience storage read errors', async () => {
  const service = createExperienceService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: failingReader,
    writeJson: noop,
    deleteObject: noop,
    isAdminApiKeyValid: () => false
  });

  await assert.rejects(service.restore, /Experience state could not be restored from storage/i);
});

test('persistent domain restores fail closed on memory storage read errors', async () => {
  const service = createMemoryService({
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: failingReader,
    writeJson: noop,
    deleteObject: noop
  });

  await assert.rejects(service.restore, /Memory state could not be restored from storage/i);
});

test('persistent domain restores fail closed on revenue storage read errors', async () => {
  const service = createRevenueService({
    readJsonWithStatus: failingReader,
    writeJson: noop,
    storageReady: true,
    repository: revenueRepository
  });

  await assert.rejects(service.restoreRevenue, /Revenue state could not be restored from storage/i);
});
