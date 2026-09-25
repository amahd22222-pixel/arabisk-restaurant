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

test('public experience payload omits private media keys', async () => {
  const service = createExperienceService({
    storageReady: true,
    presign: (method, key) => 'https://signed.example/' + method + '/' + key,
    readJson: async () => null,
    writeJson: async () => true,
    deleteObject: async () => true,
    isAdminApiKeyValid: () => false
  });

  const slug = 'public-experience-' + Date.now();
  const created = await service.create({
    slug,
    titleAr: 'اختبار عام',
    titleEn: 'Public boundary',
    startsAt: '2099-01-01T12:00:00.000Z',
    status: 'published',
    coverImageKey: 'experiences/public.webp'
  });

  const result = service.get(created.id);

  assert.equal(result.coverImageUrl, 'https://signed.example/GET/experiences/public.webp');
  assert.equal('coverImageKey' in result, false);
  assert.equal('videoKey' in result, false);
});
