import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceService } from '../apps/web/services/experience-service.js';

test('experience service exposes only bookable experience data to reservations', async () => {
  const service = createExperienceService({
    storageReady: false,
    presign: () => '',
    readJson: async () => null,
    writeJson: async () => true,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => false
  });

  const slug = 'reservation-boundary-' + Date.now();
  await service.create({
    slug,
    titleAr: 'اختبار',
    titleEn: 'Boundary test',
    startsAt: '2099-01-01T10:00:00.000Z',
    status: 'published',
    bookingEnabled: true
  });

  assert.deepEqual(service.findBookable(slug), {
    slug,
    startsAt: '2099-01-01T10:00:00.000Z',
    endsAt: ''
  });
});
