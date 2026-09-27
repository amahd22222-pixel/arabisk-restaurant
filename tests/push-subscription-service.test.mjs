import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPushSubscriptionService } from '../apps/web/services/push-subscription-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);

const validBody = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
  contextTag: 'order'
};

test('saveSubscription rejects an invalid subscription payload', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => true }) },
    cleanText,
    crypto
  });

  await assert.rejects(
    () => service.saveSubscription({ endpoint: 'not-a-url', keys: {} }),
    /valid push subscription/i
  );
  assert.equal(pushSubscriptions.length, 0);
});

test('saveSubscription stores a new subscription', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => true }) },
    cleanText,
    crypto
  });

  const result = await service.saveSubscription(validBody);

  assert.equal(result.subscribed, true);
  assert.equal(pushSubscriptions.length, 1);
  assert.equal(pushSubscriptions[0].endpoint, validBody.endpoint);
  assert.equal(pushSubscriptions[0].contextTag, 'order');
});

test('saveSubscription updates an existing subscription by endpoint instead of duplicating', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => true }) },
    cleanText,
    crypto
  });

  await service.saveSubscription(validBody);
  await service.saveSubscription({ ...validBody, keys: { p256dh: 'new-p256dh', auth: 'new-auth' } });

  assert.equal(pushSubscriptions.length, 1);
  assert.equal(pushSubscriptions[0].p256dh, 'new-p256dh');
});

test('saveSubscription rolls back when persistence fails', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => false }) },
    cleanText,
    crypto
  });

  await assert.rejects(() => service.saveSubscription(validBody), /persisted to storage/i);
  assert.equal(pushSubscriptions.length, 0);
});

test('removeSubscription deletes a stored subscription by endpoint', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => true }) },
    cleanText,
    crypto
  });

  await service.saveSubscription(validBody);
  const result = await service.removeSubscription(validBody.endpoint);

  assert.equal(result.subscribed, false);
  assert.equal(pushSubscriptions.length, 0);
});

test('removeSubscription is a safe no-op for an unknown endpoint', async () => {
  const pushSubscriptions = [];
  const service = createPushSubscriptionService({
    repository: { pushSubscriptions: createCollectionRepository(pushSubscriptions, { persist: async () => true }) },
    cleanText,
    crypto
  });

  const result = await service.removeSubscription('https://fcm.googleapis.com/fcm/send/unknown');
  assert.equal(result.subscribed, false);
});
