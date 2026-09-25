import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategoryService } from '../apps/web/services/category-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

test('duplicate category update is rejected without mutating the original', async () => {
  const categories = [
    { id: 'C001', nameAr: 'الأولى', nameEn: 'First', imageUrl: '', imageKey: '', sortOrder: 1, active: true },
    { id: 'C002', nameAr: 'الثانية', nameEn: 'Second', imageUrl: '', imageKey: '', sortOrder: 2, active: true }
  ];
  const categoryRepository = createCollectionRepository(categories);
  const productRepository = createCollectionRepository([]);

  const service = createCategoryService({
    categoriesRepository: categoryRepository,
    productsRepository: productRepository,
    storageReady: false,
    presign: () => { throw new Error('presign should not be called'); },
    readJson: async () => null,
    writeJson: async () => true,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => true
  });

  await assert.rejects(
    service.update('C002', { nameAr: 'الأولى' }),
    error => error.status === 409
  );

  assert.equal(categories[1].nameAr, 'الثانية');
});

test('category creation normalizes shared input values before persistence', async () => {
  const categories = [];
  const categoryRepository = createCollectionRepository(categories);
  const productRepository = createCollectionRepository([]);

  const service = createCategoryService({
    categoriesRepository: categoryRepository,
    productsRepository: productRepository,
    storageReady: false,
    presign: () => { throw new Error('presign should not be called'); },
    readJson: async () => null,
    writeJson: async () => true,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => true
  });

  const created = await service.create({
    nameAr: '  الأطباق الرئيسية  ',
    nameEn: '  Main Dishes  ',
    imageUrl: '  https://example.com/category.webp  ',
    imageKey: '/categories/C001/image.webp',
    active: false
  });

  assert.equal(created.nameAr, 'الأطباق الرئيسية');
  assert.equal(created.nameEn, 'Main Dishes');
  assert.equal(created.imageUrl, 'https://example.com/category.webp');
  assert.equal(created.imageKey, 'categories/C001/image.webp');
  assert.equal(created.active, false);
  assert.equal(categories.length, 1);
});


test('public category listing omits private storage keys', async () => {
  const categories = [{
    id: 'C010',
    nameAr: 'خاصة',
    nameEn: 'Private',
    imageUrl: '',
    imageKey: 'categories/C010/private.webp',
    sortOrder: 1,
    active: true
  }];
  const categoryRepository = createCollectionRepository(categories);
  const service = createCategoryService({
    categoriesRepository: categoryRepository,
    productsRepository: createCollectionRepository([]),
    storageReady: true,
    presign: () => 'https://signed.example/category.webp',
    readJson: async () => null,
    writeJson: async () => true,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => false
  });

  const [result] = service.list({});

  assert.equal(result.imageUrl, 'https://signed.example/category.webp');
  assert.equal('imageKey' in result, false);
});


test('category creation rolls back when persistence fails', async () => {
  const categories = [];
  const service = createCategoryService({
    categoriesRepository: createCollectionRepository(categories),
    productsRepository: createCollectionRepository([]),
    storageReady: true,
    presign: () => '',
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => false,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => true
  });

  await assert.rejects(
    () => service.create({
      nameAr: 'قسم مؤقت',
      nameEn: 'Temporary'
    }),
    /persisted to storage/i
  );

  assert.equal(categories.length, 0);
});
