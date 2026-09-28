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


function createProductFixture({ persist = async () => true } = {}) {
  const products = [{
    id: 'P001',
    categoryId: 'C001',
    nameAr: 'طبق',
    nameEn: 'Dish',
    descriptionAr: '',
    descriptionEn: '',
    imageUrl: '',
    imageKey: 'products/P001/old.webp',
    price: 100,
    available: true,
    videoKey: 'products/P001/old.mp4',
    tags: [],
    dietary: [],
    spiceLevel: 0,
    chefChoice: false,
    isNew: false
  }];
  const repository = createCollectionRepository(products, { persist });
  const events = [];
  const service = createProductService({
    repository,
    categories: { some: () => true },
    storageReady: true,
    presign: (method, key) => `https://signed.example/${method}/${key}`,
    deleteObject: async key => { events.push(`delete:${key}`); return true; },
    isAdminApiKeyValid: () => true,
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max),
    cleanKey: value => String(value ?? '').trim(),
    cleanUrl: value => {
      const text = String(value ?? '').trim();
      return /^https?:\/\//i.test(text) ? text : text.startsWith('/') && !text.startsWith('//') ? text : '';
    },
    normalizeList: value => Array.isArray(value) ? value : [],
    smartSnapshot: () => ({ popularIds: new Set() }),
    withMediaUrls: product => ({
      ...product,
      imageUrl: product.imageKey ? `https://signed.example/GET/${product.imageKey}` : product.imageUrl,
      videoUrl: product.videoKey ? `https://signed.example/GET/${product.videoKey}` : ''
    }),
    invalidateSmartSnapshot: () => { events.push('invalidate'); },
    nextProductId: () => 'P002',
    maxVideoBytes: 120 * 1024 * 1024,
    videoTypes: new Set(['video/mp4'])
  });
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return value; }
  };
  return { service, products, events, response };
}

test('product update persists before deleting replaced media', async () => {
  const { service, events, response } = createProductFixture();

  await service.update(
    { params: { id: 'P001' }, body: { imageKey: 'products/P001/new.webp', videoKey: 'products/P001/new.mp4' } },
    response
  );

  assert.deepEqual(events, [
    'delete:products/P001/old.webp',
    'delete:products/P001/old.mp4',
    'invalidate'
  ]);
});

test('product update rolls back when persistence fails and keeps old media', async () => {
  const { service, products, events } = createProductFixture({ persist: async () => false });

  await assert.rejects(
    () => service.update(
      { params: { id: 'P001' }, body: { nameAr: 'جديد', imageKey: 'products/P001/new.webp' } },
      { status() { return this; }, json() { return this; } }
    ),
    /persisted to storage/i
  );

  assert.equal(products[0].nameAr, 'طبق');
  assert.equal(products[0].imageKey, 'products/P001/old.webp');
  assert.deepEqual(events, []);
});

test('product removal persists before deleting media', async () => {
  const { service, products, events } = createProductFixture();
  const response = {
    status() { return this; },
    json(value) { this.payload = value; return value; }
  };

  await service.remove({ params: { id: 'P001' } }, response);

  assert.equal(products.length, 0);
  assert.deepEqual(events, [
    'delete:products/P001/old.webp',
    'delete:products/P001/old.mp4',
    'invalidate'
  ]);
});

test('product removal restores the product when persistence fails', async () => {
  const { service, products } = createProductFixture({ persist: async () => false });
  const response = {
    status() { return this; },
    json() { return this; }
  };

  await assert.rejects(
    () => service.remove({ params: { id: 'P001' } }, response),
    /persisted to storage/i
  );

  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'P001');
  assert.equal(products[0].imageKey, 'products/P001/old.webp');
  assert.equal(products[0].videoKey, 'products/P001/old.mp4');
});

test('product creation rolls back when persistence fails', async () => {
  const products = [];
  const repository = createCollectionRepository(products, { persist: async () => false });
  const service = createProductService({
    repository,
    categories: { some: () => true },
    storageReady: false,
    presign: () => '',
    deleteObject: async () => true,
    isAdminApiKeyValid: () => true,
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max),
    cleanKey: value => String(value ?? '').trim(),
    cleanUrl: value => String(value ?? '').trim(),
    normalizeList: value => Array.isArray(value) ? value : [],
    smartSnapshot: () => ({ popularIds: new Set() }),
    withMediaUrls: product => ({ ...product }),
    invalidateSmartSnapshot: () => { throw new Error('must not invalidate before persistence'); },
    nextProductId: () => 'P001',
    maxVideoBytes: 120 * 1024 * 1024,
    videoTypes: new Set(['video/mp4'])
  });

  await assert.rejects(
    () => service.create(
      { body: {
        categoryId: 'C001',
        nameAr: 'طبق',
        nameEn: 'Dish',
        price: 100
      } },
      { status() { return this; }, json() { return this; } }
    ),
    /persisted to storage/i
  );

  assert.equal(products.length, 0);
});
