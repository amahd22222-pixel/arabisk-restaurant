import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UAE_TIME_ZONE,
  addUaeDays,
  getUaeDateOnly,
  parseUaeLocalDateTime,
  getUaeTimeContext
} from '../apps/web/utils/uae-time.js';
import { createReservationService } from '../apps/web/services/reservation-service.js';

test('UAE time utilities use Abu Dhabi/Gulf time consistently around UTC midnight', () => {
  assert.equal(UAE_TIME_ZONE, 'Asia/Dubai');
  assert.equal(getUaeDateOnly(new Date('2026-09-27T20:30:00.000Z')), '2026-09-28');
  assert.equal(getUaeDateOnly(new Date('2026-09-28T19:59:59.000Z')), '2026-09-28');
  assert.equal(getUaeDateOnly(new Date('2026-09-28T20:00:00.000Z')), '2026-09-29');
  assert.equal(addUaeDays(new Date('2026-09-28T20:30:00.000Z'), 1), '2026-09-29');
  const context = getUaeTimeContext(new Date('2026-09-28T20:00:00.000Z'));
  assert.equal(context.date, '2026-09-29');
  assert.equal(context.time, '00:00');
  assert.equal(context.timeZone, 'Asia/Dubai');
  assert.equal(
    parseUaeLocalDateTime('2026-09-28', '00:30'),
    Date.parse('2026-09-27T20:30:00.000Z')
  );
});

test('reservation date validation follows Abu Dhabi calendar date, not server UTC date', async () => {
  const reservations = [];
  const customers = [];

  const service = createReservationService({
    repository: {
      reservations: {
        all: () => reservations,
        findByIdempotencyKey: () => null,
        findDuplicate: () => null,
        add: reservation => reservations.push(reservation),
        save: async () => true,
        removeById: id => {
          const index = reservations.findIndex(item => item.id === id);
          if (index >= 0) reservations.splice(index, 1);
        }
      },
      customers: {
        findById: () => null,
        findByPhone: () => null,
        add: customer => customers.push(customer),
        removeById: id => {
          const index = customers.findIndex(item => item.id === id);
          if (index >= 0) customers.splice(index, 1);
        }
      }
    },
    cleanText: value => String(value ?? '').trim(),
    nextReservationId: () => 'R-UAE-1',
    findBookableExperience: () => null,
    revenue: { recordEvent: () => true },
    crypto: { randomUUID: () => 'C-UAE-1' },
    now: () => new Date('2026-09-27T20:30:00.000Z')
  });

  const reservation = await service.createReservation({
    name: 'أحمد',
    phone: '0500000000',
    date: '2026-09-28',
    time: '10:00',
    guests: 2
  });

  assert.equal(reservation.date, '2026-09-28');
  assert.equal(reservations.length, 1);

  await assert.rejects(
    service.createReservation({
      name: 'أحمد',
      phone: '0500000000',
      date: '2026-09-27',
      time: '10:00',
      guests: 2
    }),
    /not in the past/
  );

  await assert.rejects(
    service.createReservation({
      name: 'أحمد',
      phone: '0500000000',
      date: '2026-09-28',
      time: '23:59',
      guests: 2
    }),
    /future for Abu Dhabi time/
  );

  const lateNightService = createReservationService({
    repository: {
      reservations: {
        all: () => reservations,
        findByIdempotencyKey: () => null,
        findDuplicate: () => null,
        add: reservation => reservations.push(reservation),
        save: async () => true,
        removeById: id => {
          const index = reservations.findIndex(item => item.id === id);
          if (index >= 0) reservations.splice(index, 1);
        }
      },
      customers: {
        findById: () => null,
        findByPhone: () => null,
        add: customer => customers.push(customer),
        removeById: id => {
          const index = customers.findIndex(item => item.id === id);
          if (index >= 0) customers.splice(index, 1);
        }
      }
    },
    cleanText: value => String(value ?? '').trim(),
    nextReservationId: () => 'R-UAE-2',
    findBookableExperience: () => null,
    revenue: { recordEvent: () => true },
    crypto: { randomUUID: () => 'C-UAE-2' },
    now: () => new Date('2026-09-28T20:00:00.000Z')
  });

  const futureReservation = await lateNightService.createReservation({
    name: 'أحمد',
    phone: '0500000000',
    date: '2026-09-29',
    time: '00:30',
    guests: 2
  });
  assert.equal(futureReservation.date, '2026-09-29');
  assert.equal(futureReservation.time, '00:30');
});
