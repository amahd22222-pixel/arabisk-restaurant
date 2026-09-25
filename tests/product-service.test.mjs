import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductService } from '../apps/web/services/product-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

test('public product payload omits private storage keys', () => {
  const products = [{
    id: 'P001',
    categoryId: 'C001',
    nameAr: 'طبق',
    nameEn: 'Dish',
    descriptionAr: '',
    descriptionEn: '',
    imageUrl: '',
    imageKey: 'products/P001/private.webp',
    price: 100,
    available: true,
    videoKey: 'products/P001/private.mp4',
    tags: [],
    dietary: [],
    spiceLevel: 0,
    chefChoice: false,
    isNew: false
  }];

  const repository = createCollectionRepository(products);
  const service = createProductService({
    repository,
    categories: { some: () => true },
    storageReady: true,
    presign: () => '',
    deleteObject: async () => true,
    isAdminApiKeyValid: () => false,
    cleanText: value => String(value ?? '').trim(),
    cleanKey: value => String(value ?? '').trim(),
    cleanUrl: value => String(value ?? '').trim(),
    normalizeList: value => Array.isArray(value) ? value : [],
    smartSnapshot: () => ({ popularIds: new Set() }),
    withMediaUrls: product => ({
      ...product,
      imageUrl: 'https://signed.example/image.webp',
      videoUrl: 'https://signed.example/video.mp4',
      smart: {}
    }),
    invalidateSmartSnapshot: () => {},
    nextProductId: () => 'P002',
    maxVideoBytes: 120 * 1024 * 1024,
    videoTypes: new Set(['video/mp4'])
  });

  let payload;
  const response = service.list({ query: {} }, { json(value) { payload = value; return value; } });

  assert.deepEqual(response, payload);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].imageUrl, 'https://signed.example/image.webp');
  assert.equal(payload[0].videoUrl, 'https://signed.example/video.mp4');
  assert.equal('imageKey' in payload[0], false);
  assert.equal('videoKey' in payload[0], false);
});
