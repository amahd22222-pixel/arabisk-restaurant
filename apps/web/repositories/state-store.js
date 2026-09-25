export function createStateStore({ readJsonWithStatus, writeJson, storageReady, stateKey, menuVersion, products, customers, orders, reservations }) {
  const PERSIST_DEBOUNCE_MS = 250;
  let persistQueue = Promise.resolve(true);
  let persistTimer = null;
  let persistRequested = false;
  let persistWaiters = [];
  let restoreStatus = 'not_started';
  let restoredAt = null;
  let lastPersistAt = null;
  let lastPersistOk = storageReady ? null : true;

  const settlePersistWaiters = (result, waiters) => {
    for (const resolve of waiters) resolve(result);
  };

  const rebuildCustomerOrderStats = () => {
    const statsByPhone = new Map();
    for (const order of orders) {
      if (order.status !== 'completed' || order.orderType !== 'pickup' || !order.phone) continue;
      const current = statsByPhone.get(order.phone) || { count: 0, lastOrderAt: '' };
      current.count += 1;
      const completedAt = order.completedAt || order.createdAt || '';
      if (completedAt && (!current.lastOrderAt || completedAt > current.lastOrderAt)) current.lastOrderAt = completedAt;
      statsByPhone.set(order.phone, current);
    }
    for (const customer of customers) {
      const stats = statsByPhone.get(customer.phone);
      customer.orderCount = stats?.count || 0;
      customer.lastOrderAt = stats?.lastOrderAt || '';
    }
  };

  async function restore() {
    restoreStatus = storageReady ? 'reading' : 'storage_not_configured';
    if (!storageReady) {
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
    if (saved.menuVersion === menuVersion && Array.isArray(saved.products) && saved.products.length) {
      products.splice(0, products.length, ...saved.products);
    }
    if (Array.isArray(saved.orders)) orders.splice(0, orders.length, ...saved.orders);
    if (Array.isArray(saved.customers)) customers.splice(0, customers.length, ...saved.customers);
    if (Array.isArray(saved.reservations)) reservations.splice(0, reservations.length, ...saved.reservations);
    rebuildCustomerOrderStats();
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
    const snapshot = structuredClone({ menuVersion, products, orders, customers, reservations });
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
    if (!storageReady) return Promise.resolve(true);
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
