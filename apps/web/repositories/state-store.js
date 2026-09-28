import { normalizePhone } from '../utils/phone.js';

export function createStateStore({ readJsonWithStatus, writeJson, storageReady, dbReady = storageReady, stateKey, menuVersion, products, customers, orders, reservations, pushSubscriptions, notificationDevices }) {
  const PERSIST_DEBOUNCE_MS = 250;
  let persistQueue = Promise.resolve(true);
  let persistTimer = null;
  let persistRequested = false;
  let persistWaiters = [];
  let restoreStatus = 'not_started';
  let restoredAt = null;
  let lastPersistAt = null;
  const persistenceReady = dbReady || storageReady;
  let lastPersistOk = persistenceReady ? null : true;

  const settlePersistWaiters = (result, waiters) => {
    for (const resolve of waiters) resolve(result);
  };

  const rebuildCustomerStats = () => {
    const byId = new Map();
    const byPhone = new Map();

    for (const customer of customers) {
      if (!customer || typeof customer !== 'object') continue;
      byId.set(String(customer.id || ''), customer);
      const phone = normalizePhone(customer.phone);
      if (phone) byPhone.set(phone, customer);
      customer.orderCount = 0;
      customer.lastOrderAt = '';
      customer.reservationCount = 0;
      customer.lastReservationAt = '';
      customer.totalOrderValue = 0;
      customer.lastActivityAt = customer.appProfileUpdatedAt || customer.appProfileCreatedAt || customer.createdAt || '';
      if (!customer.firstSeenAt) {
        customer.firstSeenAt = customer.appProfileCreatedAt || customer.createdAt || '';
      }
    }

    const touch = (customer, activityAt) => {
      if (!customer || !activityAt) return;
      if (!customer.firstSeenAt || Date.parse(activityAt) < Date.parse(customer.firstSeenAt || '')) {
        customer.firstSeenAt = activityAt;
      }
      if (!customer.lastActivityAt || Date.parse(activityAt) > Date.parse(customer.lastActivityAt || '')) {
        customer.lastActivityAt = activityAt;
      }
    };

    for (const order of orders) {
      if (order?.status !== 'completed') continue;
      const customer = order.customerId
        ? byId.get(String(order.customerId))
        : (order.phone ? byPhone.get(normalizePhone(order.phone)) : null);
      if (!customer) continue;
      customer.orderCount += 1;
      customer.totalOrderValue = Math.round((Number(customer.totalOrderValue || 0) + Number(order.total || 0)) * 100) / 100;
      const activityAt = order.completedAt || order.updatedAt || order.createdAt || '';
      if (activityAt && (!customer.lastOrderAt || Date.parse(activityAt) > Date.parse(customer.lastOrderAt || ''))) {
        customer.lastOrderAt = activityAt;
      }
      touch(customer, activityAt);
    }

    for (const reservation of reservations) {
      const customer = reservation?.customerId
        ? byId.get(String(reservation.customerId))
        : (reservation?.phone ? byPhone.get(normalizePhone(reservation.phone)) : null);
      if (!customer) continue;
      customer.reservationCount += 1;
      const activityAt = reservation.createdAt || '';
      if (activityAt && (!customer.lastReservationAt || Date.parse(activityAt) > Date.parse(customer.lastReservationAt || ''))) {
        customer.lastReservationAt = activityAt;
      }
      touch(customer, activityAt);
    }
  };

  async function restore() {
    restoreStatus = persistenceReady ? 'reading' : 'storage_not_configured';
    if (!persistenceReady) {
      restoredAt = new Date().toISOString();
      return;
    }
    const result = await readJsonWithStatus(stateKey);
    if (!result.ok) {
      restoreStatus = 'restore_failed';
      restoredAt = new Date().toISOString();
      lastPersistOk = false;
      throw new Error('State snapshot could not be restored from storage.');
    }
    const saved = result.value;
    if (!result.found || !saved || typeof saved !== 'object') {
      restoreStatus = 'no_snapshot';
      restoredAt = new Date().toISOString();
      return;
    }
    if (saved.menuVersion === menuVersion && Array.isArray(saved.products)) {
      products.splice(0, products.length, ...saved.products);
    }
    if (Array.isArray(saved.orders)) orders.splice(0, orders.length, ...saved.orders);
    if (Array.isArray(saved.customers)) customers.splice(0, customers.length, ...saved.customers);
    if (Array.isArray(saved.reservations)) reservations.splice(0, reservations.length, ...saved.reservations);
    if (Array.isArray(saved.pushSubscriptions) && pushSubscriptions) {
      pushSubscriptions.splice(0, pushSubscriptions.length, ...saved.pushSubscriptions);
    }
    if (Array.isArray(saved.notificationDevices) && notificationDevices) {
      notificationDevices.splice(0, notificationDevices.length, ...saved.notificationDevices);
    }
    rebuildCustomerStats();
    restoreStatus = 'restored';
    restoredAt = new Date().toISOString();
  }

  const flush = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!persistRequested) return persistQueue;
    persistRequested = false;
    const snapshot = structuredClone({ menuVersion, products, orders, customers, reservations, pushSubscriptions: pushSubscriptions || [], notificationDevices: notificationDevices || [] });
    const waiters = persistWaiters;
    persistWaiters = [];
    persistQueue = persistQueue.catch(() => true).then(async () => {
      try {
        const ok = await writeJson(stateKey, snapshot);
        lastPersistOk = ok;
        lastPersistAt = new Date().toISOString();
        return ok;
      } catch {
        lastPersistOk = false;
        lastPersistAt = new Date().toISOString();
        return false;
      }
    });
    persistQueue.then(result => settlePersistWaiters(result, waiters));
    return persistQueue;
  };

  const persist = () => {
    if (!persistenceReady) return Promise.resolve(true);
    if (restoreStatus === 'restore_failed') return Promise.resolve(false);

    persistRequested = true;
    const result = new Promise(resolve => persistWaiters.push(resolve));

    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        void flush();
      }, PERSIST_DEBOUNCE_MS);
      persistTimer.unref();
    }

    return result;
  };

  return {
    restore,
    persist,
    flush,
    status: () => ({
      restoreStatus,
      restoredAt,
      lastPersistAt,
      lastPersistOk
    })
  };
}
