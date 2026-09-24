import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderService } from '../apps/web/services/order-service.js';

function createFixture() {
  const orders = [];
  const customers = [];
  const events = [];
  const repository = {
    orders: {
      all: () => orders,
      findById: id => orders.find(order => order.id === id),
      save: () => {}
    },
    customers: {
      findByPhone: phone => customers.find(customer => customer.phone === phone),
      add: customer => customers.push(customer),
      all: () => customers,
      save: () => {}
    }
  };

  const service = createOrderService({
    repository,
    products: [{ id: 'P001', nameAr: 'طبق', nameEn: 'Dish', price: 25, available: true }],
    cleanText: (value, max = 180) => String(value ?? '').trim().slice(0, max),
    nextOrderId: () => 'O00001',
    invalidateSmartSnapshot: () => {},
    revenue: {
      recordEvent: event => events.push(event),
      recordRecoveryOrder: () => {}
    },
    crypto: { randomUUID: () => 'customer-1' }
  });

  return { service, orders, customers, events };
}

test('order total is calculated from server-side product price', () => {
  const { service } = createFixture();
  const order = service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 2, unitPrice: 1 }]
  });

  assert.equal(order.total, 50);
  assert.equal(order.items[0].unitPrice, 25);
});

test('invalid status transition is rejected', () => {
  const { service } = createFixture();
  const order = service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 1 }]
  });

  assert.throws(
    () => service.updateOrder(order.id, { status: 'completed' }),
    error => error.status === 409
  );
});

test('public status requires matching pickup phone', () => {
  const { service } = createFixture();
  const order = service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 1 }]
  });

  assert.throws(
    () => service.getPublicStatus({ orderId: order.id, phone: '0511111111' }),
    error => error.status === 404
  );

  assert.equal(
    service.getPublicStatus({ orderId: order.id, phone: '0500000000' }).id,
    order.id
  );
});