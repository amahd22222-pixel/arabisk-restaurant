import crypto from 'node:crypto';

const REVENUE_STATE_KEY = 'data/arabisk-revenue-v1.json';
const MAX_EVENTS = 8000;
const ALLOWED_EVENTS = new Set([
  'menu_view',
  'item_view',
  'add_to_cart',
  'checkout_started',
  'order_completed',
  'reservation_created'
]);

const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function registerRevenueRoutes(app, {
  readJson,
  writeJson,
  storageReady,
  requireAdminApiKey,
  customers,
  reservations
}) {
  const events = [];
  let persistQueue = Promise.resolve();

  async function restoreRevenue() {
    if (!storageReady) return;
    const saved = await readJson(REVENUE_STATE_KEY, null);
    if (saved && Array.isArray(saved.events)) {
      events.splice(0, events.length, ...saved.events.slice(-MAX_EVENTS));
    }
  }

  function persistRevenue() {
    if (!storageReady) return Promise.resolve(false);
    const snapshot = { version: 1, events: events.slice(-MAX_EVENTS) };
    persistQueue = persistQueue.catch(() => {}).then(() => writeJson(REVENUE_STATE_KEY, snapshot));
    return persistQueue;
  }

  function recordEvent(input = {}) {
    const eventName = clean(input.eventName || input.event, 50);
    if (!ALLOWED_EVENTS.has(eventName)) return null;
    const row = {
      id: crypto.randomUUID(),
      eventName,
      sessionId: clean(input.sessionId, 100),
      customerId: clean(input.customerId, 100),
      productId: clean(input.productId, 50),
      orderId: clean(input.orderId, 30),
      reservationId: clean(input.reservationId, 30),
      cartValue: Math.max(0, number(input.cartValue)),
      orderValue: Math.max(0, number(input.orderValue)),
      metadata: input.metadata && typeof input.metadata === 'object'
        ? JSON.parse(JSON.stringify(input.metadata).slice(0, 2000))
        : {},
      createdAt: new Date().toISOString()
    };
    events.push(row);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    void persistRevenue();
    return row;
  }

  function uniqueSessions(rows, eventName) {
    return new Set(rows.filter(row => row.eventName === eventName).map(row => row.sessionId || row.id)).size;
  }

  function buildSummary() {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recent = events.filter(row => {
      const time = Date.parse(row.createdAt || '');
      return Number.isFinite(time) && time >= thirtyDaysAgo;
    });

    const funnel = {
      menuViews: uniqueSessions(recent, 'menu_view'),
      itemViews: uniqueSessions(recent, 'item_view'),
      addToCart: uniqueSessions(recent, 'add_to_cart'),
      checkoutStarted: uniqueSessions(recent, 'checkout_started'),
      completedOrders: uniqueSessions(recent, 'order_completed')
    };

    const bySession = new Map();
    for (const row of recent) {
      if (!row.sessionId) continue;
      const current = bySession.get(row.sessionId) || {
        sessionId: row.sessionId,
        lastActivityAt: row.createdAt,
        cartValue: 0,
        productId: '',
        hasIntent: false,
        completed: false
      };
      if (Date.parse(row.createdAt) >= Date.parse(current.lastActivityAt)) current.lastActivityAt = row.createdAt;
      if (row.eventName === 'add_to_cart' || row.eventName === 'checkout_started') {
        current.hasIntent = true;
        current.cartValue = Math.max(current.cartValue, number(row.cartValue));
        current.productId = row.productId || current.productId;
      }
      if (row.eventName === 'order_completed') current.completed = true;
      bySession.set(row.sessionId, current);
    }

    const abandoned = [...bySession.values()]
      .filter(item => item.hasIntent && !item.completed)
      .filter(item => {
        const age = now - Date.parse(item.lastActivityAt || '');
        return Number.isFinite(age) && age >= 30 * 60 * 1000 && age <= 72 * 60 * 60 * 1000;
      })
      .sort((a, b) => number(b.cartValue) - number(a.cartValue))
      .slice(0, 50);

    const inactiveCustomers = customers
      .filter(customer => number(customer.orderCount) >= 2)
      .map(customer => ({ ...customer, daysSinceLastOrder: Math.floor((now - Date.parse(customer.lastOrderAt || '')) / 86400000) }))
      .filter(customer => Number.isFinite(customer.daysSinceLastOrder) && customer.daysSinceLastOrder >= 21)
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
      .slice(0, 50)
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        orderCount: customer.orderCount,
        lastOrderAt: customer.lastOrderAt,
        daysSinceLastOrder: customer.daysSinceLastOrder
      }));

    const upcomingReservations = reservations
      .filter(reservation => reservation.status !== 'cancelled')
      .map(reservation => {
        const at = Date.parse(`${reservation.date}T${reservation.time}:00`);
        return { ...reservation, at };
      })
      .filter(reservation => Number.isFinite(reservation.at) && reservation.at > now && reservation.at <= now + 48 * 60 * 60 * 1000)
      .sort((a, b) => a.at - b.at)
      .slice(0, 50)
      .map(({ at, ...reservation }) => reservation);

    return {
      generatedAt: new Date().toISOString(),
      windowDays: 30,
      funnel,
      opportunities: {
        abandonedCarts: abandoned,
        inactiveCustomers,
        upcomingReservations
      },
      counts: {
        abandonedCarts: abandoned.length,
        inactiveCustomers: inactiveCustomers.length,
        upcomingReservations: upcomingReservations.length
      },
      potentialAbandonedRevenue: abandoned.reduce((sum, item) => sum + number(item.cartValue), 0)
    };
  }

  app.post('/api/events', (req, res) => {
    const event = recordEvent(req.body || {});
    if (!event) return res.status(400).json({ message: 'Unsupported event.' });
    return res.status(202).json({ accepted: true, id: event.id });
  });

  app.get('/api/revenue/summary', requireAdminApiKey, (_req, res) => {
    return res.json(buildSummary());
  });

  return { restoreRevenue, recordEvent, buildSummary };
}
