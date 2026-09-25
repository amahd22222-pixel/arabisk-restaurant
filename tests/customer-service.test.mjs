import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerService } from '../apps/web/services/customer-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

test('customer note update rolls back when persistence fails', async () => {
  const customers = [{
    id: 'customer-1',
    name: 'Ahmed',
    phone: '0500000000',
    internalNotes: 'قبل',
    internalNotesUpdatedAt: '2099-01-01T00:00:00.000Z'
  }];
  const service = createCustomerService({
    repository: {
      customers: createCollectionRepository(customers, { persist: async () => false })
    },
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max)
  });

  await assert.rejects(
    () => service.updateCustomer('customer-1', { internalNotes: 'بعد' }),
    /persisted to storage/i
  );

  assert.equal(customers[0].internalNotes, 'قبل');
  assert.equal(customers[0].internalNotesUpdatedAt, '2099-01-01T00:00:00.000Z');
});

test('customer note update persists new note successfully', async () => {
  const customers = [{ id: 'customer-1', name: 'Ahmed', phone: '0500000000' }];
  const service = createCustomerService({
    repository: {
      customers: createCollectionRepository(customers, { persist: async () => true })
    },
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max)
  });

  const result = await service.updateCustomer('customer-1', { internalNotes: ' ملاحظة ' });

  assert.equal(result.internalNotes, 'ملاحظة');
  assert.ok(result.internalNotesUpdatedAt);
});
