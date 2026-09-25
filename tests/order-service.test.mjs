import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderService } from '../apps/web/services/order-service.js';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

function createFixture({ persist = async () => true } = {}) {
  const orders = [];
  const customers = [];
  const products = [{ id: 'P001', nameAr: 'طبق', nameEn: 'Dish', price: 25, available: true }];
  const events = [];
  const repository = {
    orders: createCollectionRepository(orders, { persist }),
    products: createCollectionRepository(products),
    customers: {
      ...createCollectionRepository(customers),
      findByPhone: phone => customers.find(customer => customer.phone === phone)
    }
  };

  const service = createOrderService({
    repository,
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

test('order total is calculated from server-side product price', async () => {
  const { service } = createFixture();
  const order = await service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 2, unitPrice: 1 }]
  });

  assert.equal(order.total, 50);
  assert.equal(order.items[0].unitPrice, 25);
});

test('invalid status transition is rejected', async () => {
  const { service } = createFixture();
  const order = await service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 1 }]
  });

  await assert.rejects(
    () => service.updateOrder(order.id, { status: 'completed' }),
    error => error.status === 409
  );
});

test('public status requires matching pickup phone', async () => {
  const { service } = createFixture();
  const order = await service.createOrder({
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


test('order creation rolls back order and customer when persistence fails', async () => {
  const { service, orders, customers, events } = createFixture({
    persist: async () => false
  });

  await assert.rejects(
    () => service.createOrder({
      orderType: 'pickup',
      name: 'Ahmed',
      phone: '0500000000',
      items: [{ productId: 'P001', quantity: 1 }]
    }),
    /persisted to storage/i
  );

  assert.equal(orders.length, 0);
  assert.equal(customers.length, 0);
  assert.equal(events.length, 0);
});

test('completed order update rolls back order and customer when persistence fails', async () => {
  let failSave = false;
  const { service, orders, customers, events } = createFixture({
    persist: async () => !failSave
  });

  const order = await service.createOrder({
    orderType: 'pickup',
    name: 'Ahmed',
    phone: '0500000000',
    items: [{ productId: 'P001', quantity: 1 }]
  });

  const customer = customers[0];
  assert.equal(customer.orderCount, 0);
  failSave = true;

  await service.updateOrder(order.id, { status: 'confirmed' });
  await assert.rejects(
    () => service.updateOrder(order.id, { status: 'preparing' }),
    /persisted to storage/i
  );

  assert.equal(orders[0].status, 'confirmed');
  assert.equal(customers[0].orderCount, 0);
  assert.equal(events.filter(event => event.eventName === 'order_completed').length, 0);
});
