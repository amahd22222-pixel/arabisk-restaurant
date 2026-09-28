import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromotionService } from '../apps/web/services/promotion-service.js';

function createFixture() {
  const service = createPromotionService({
    storageReady: true,
    readJsonWithStatus: async () => ({ ok: true, found: false, value: null }),
    writeJson: async () => true
  });
  return { service };
}

test('install reward is bound to one app installation', async () => {
  const { service } = createFixture();
  const reward = await service.claimInstallReward('client-install-1');

  const quote = service.quoteInstallReward(reward.code, 100, 'client-install-1');
  assert.equal(quote.total, 80);

  assert.throws(
    () => service.quoteInstallReward(reward.code, 100, 'another-install'),
    error => error.status === 400
  );
});

test('install reward can only be reserved once', async () => {
  const { service } = createFixture();
  const reward = await service.claimInstallReward('client-install-1');

  const reservation = await service.reserveInstallReward(reward.code, 100, 'O00001', 'client-install-1');
  assert.equal(reservation.total, 80);

  await assert.rejects(
    () => service.reserveInstallReward(reward.code, 100, 'O00002', 'client-install-1'),
    error => error.status === 409
  );

  assert.equal(await service.rollbackReservation(reservation), true);

  const reservationAgain = await service.reserveInstallReward(reward.code, 100, 'O00003', 'client-install-1');
  assert.equal(reservationAgain.total, 80);
});

test('a redeemed install reward cannot issue a second code to the same installation', async () => {
  const { service } = createFixture();
  const reward = await service.claimInstallReward('client-install-1');
  const reservation = await service.reserveInstallReward(reward.code, 100, 'O00001', 'client-install-1');
  await service.commitReservation(reservation);

  const secondClaim = await service.claimInstallReward('client-install-1');
  assert.equal(secondClaim.status, 'redeemed');
  assert.equal(secondClaim.code, '');
});

test('claim returns the same active code for the same installation', async () => {
  const { service } = createFixture();
  const first = await service.claimInstallReward('client-install-1');
  const second = await service.claimInstallReward('client-install-1');

  assert.equal(second.code, first.code);
  assert.equal(second.expiresAt, first.expiresAt);
});
