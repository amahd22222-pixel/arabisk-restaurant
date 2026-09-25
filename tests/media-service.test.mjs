import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaService } from '../apps/web/services/media-service.js';

const repository = {
  products: [{ id: 'P001', imageKey: '' }]
};

const baseOptions = {
  repository,
  storageReady: true,
  presign: () => 'https://storage.test/signed'
};

test('media details restore fails closed on storage read failure', async () => {
  const service = createMediaService({
    ...baseOptions,
    readJsonWithStatus: async () => ({ ok: false, found: false, value: null, reason: 'read_failed' }),
    writeJson: async () => true
  });

  await assert.rejects(
    () => service.getDetailsForProduct('P001'),
    /Product details could not be restored from storage/i
  );
});

test('media details update fails closed when storage write fails', async () => {
  const service = createMediaService({
    ...baseOptions,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    writeJson: async () => false
  });

  await assert.rejects(
    () => service.updateDetails('P001', {
      portion: '250g',
      ingredientsAr: 'Test',
      allergens: [],
      notesAr: '',
      gallery: []
    }),
    /Product details could not be persisted to storage/i
  );
});
