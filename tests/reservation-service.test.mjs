import test from 'node:test';
import assert from 'node:assert/strict';
import { createReservationService } from '../apps/web/services/reservation-service.js';

function createFixture() {
  const reservations = [];
  const customers = [];
  const events = [];
  const repository = {
    reservations: {
      all: () => reservations,
      findById: id => reservations.find(item => item.id === id),
      findDuplicate: (phone, date, time) => reservations.find(item => item.status !== 'cancelled' && item.phone === phone && item.date === date && item.time === time),
      add: item => reservations.push(item),
      save: () => {}
    },
    customers: {
      findByPhone: phone => customers.find(item => item.phone === phone),
      add: item => customers.push(item),
      all: () => customers,
      save: () => {}
    }
  };

  let sequence = 0;
  const service = createReservationService({
    repository,
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max),
    nextReservationId: () => 'R' + String(++sequence).padStart(4, '0'),
    experiences: [],
    revenue: { recordEvent: event => events.push(event) },
    crypto: { randomUUID: () => 'customer-1' }
  });

  return { service, reservations, customers, events };
}

test('reservation rejects dates in the past', () => {
  const { service } = createFixture();
  assert.throws(
    () => service.createReservation({ name: 'Ahmed', phone: '0500000000', date: '2020-01-01', time: '19:00', guests: 2 }),
    error => error.status === 400
  );
});

test('duplicate reservation returns conflict metadata', () => {
  const { service } = createFixture();
  const input = { name: 'Ahmed', phone: '0500000000', date: '2099-01-01', time: '19:00', guests: 2 };
  service.createReservation(input);
  assert.throws(
    () => service.createReservation(input),
    error => error.status === 409 && error.meta?.reservationId === 'R0001'
  );
});