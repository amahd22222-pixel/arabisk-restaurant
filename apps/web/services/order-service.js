const ORDER_STATUS_TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['completed', 'cancelled']),
  completed: new Set([]),
  cancelled: new Set([])
};

export function registerOrderRoutes(app, {
  repository, products, requireAdminApiKey, orderRateLimit, orderStatusRateLimit,
  cleanText, nextOrderId, invalidateSmartSnapshot, revenue, crypto
}) {
  const { orders, customers } = repository;

  app.get('/api/orders', requireAdminApiKey, (_req, res) => res.json(orders.all()));

  app.patch('/api/orders/:id', requireAdminApiKey, (req, res) => {
    const order = orders.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const now = new Date().toISOString();

    if (req.body?.status !== undefined) {
      const nextStatus = String(req.body.status);
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.has(nextStatus)) {
        return res.status(409).json({ message: `Invalid order status transition: ${order.status} -> ${nextStatus}` });
      }
      order.status = nextStatus;
      invalidateSmartSnapshot();

      if (nextStatus === 'completed') {
        order.completedAt = order.completedAt || now;
        let completedCustomerId = '';
        if (order.orderType === 'pickup' && order.phone) {
          const customer = customers.findByPhone(order.phone);
          if (customer) {
            completedCustomerId = customer.id;
            customer.name = cleanText(order.name, 80);
            customer.orderCount = Number(customer.orderCount || 0) + 1;
            customer.lastOrderAt = order.completedAt;
          }
        }
        revenue.recordEvent({
          eventName: 'order_completed',
          sessionId: cleanText(order.sessionId, 100),
          customerId: completedCustomerId,
          orderId: order.id,
          orderValue: order.total,
          metadata: { orderType: order.orderType }
        });
      }
    }

    if (req.body?.notes !== undefined) order.notes = cleanText(req.body.notes, 300);
    order.updatedAt = now;
    orders.save();
    return res.json(order);
  });

  app.post('/api/orders', orderRateLimit, (req, res) => {
    const b = req.body || {};
    const orderType = ['dine_in', 'pickup'].includes(b.orderType) ? b.orderType : 'dine_in';
    const tableNumber = orderType === 'dine_in' ? cleanText(b.tableNumber, 30) : '';
    const name = cleanText(b.name, 80);
    const phone = cleanText(b.phone, 40);
    const notes = cleanText(b.notes, 300);
    const recoveryToken = cleanText(b.recoveryToken, 80);
    const rawItems = Array.isArray(b.items) ? b.items : [];

    if (!rawItems.length || rawItems.length > 30) return res.status(400).json({ message: 'At least one order item is required' });
    if (orderType === 'dine_in' && !tableNumber) return res.status(400).json({ message: 'Table number is required for dine-in orders.' });
    if (orderType === 'pickup' && (!name || phone.length < 5 || phone.length > 40)) return res.status(400).json({ message: 'name and phone are required for pickup orders' });

    const merged = new Map();
    for (const raw of rawItems) {
      const productId = cleanText(raw?.productId, 40);
      const quantity = Number(raw?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).json({ message: 'Invalid order item.' });
      }
      const mergedQuantity = (merged.get(productId) || 0) + quantity;
      if (mergedQuantity > 20) return res.status(400).json({ message: 'Maximum quantity for a single item is 20.' });
      merged.set(productId, mergedQuantity);
    }

    const items = [];
    let total = 0;
    for (const [productId, quantity] of merged) {
      const product = products.find(item => item.id === productId && item.available !== false);
      if (!product) return res.status(400).json({ message: 'One or more selected items are no longer available.' });
      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return res.status(400).json({ message: 'Invalid product price.' });
      const lineTotal = unitPrice * quantity;
      items.push({
        productId: product.id,
        nameAr: cleanText(product.nameAr, 160),
        nameEn: cleanText(product.nameEn, 160),
        quantity,
        unitPrice,
        lineTotal
      });
      total += lineTotal;
    }

    const now = new Date().toISOString();
    const storedName = orderType === 'dine_in' ? 'طاولة ' + tableNumber : name;
    const storedPhone = orderType === 'dine_in' ? '' : phone;
    const order = {
      id: nextOrderId(),
      name: storedName,
      phone: storedPhone,
      orderType,
      tableNumber,
      notes,
      items,
      total,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      sessionId: cleanText(b.sessionId, 100),
      revenueRecoveryToken: recoveryToken,
      completedAt: ''
    };

    orders.all().push(order);
    invalidateSmartSnapshot();

    let orderCustomerId = '';
    if (orderType === 'pickup' && phone) {
      const existing = customers.findByPhone(phone);
      if (existing) {
        orderCustomerId = existing.id;
        existing.name = name;
      } else {
        orderCustomerId = crypto.randomUUID();
        customers.add({ id: orderCustomerId, name, phone, orderCount: 0, lastOrderAt: '' });
      }
    }

    revenue.recordEvent({
      eventName: 'order_created',
      sessionId: cleanText(b.sessionId, 100),
      customerId: orderCustomerId,
      orderId: order.id,
      orderValue: order.total,
      metadata: { orderType }
    });
    if (recoveryToken) revenue.recordRecoveryOrder(recoveryToken, order.id);

    orders.save();
    return res.status(201).json({
      id: order.id,
      total: order.total,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber
    });
  });

  app.post('/api/orders/status', orderStatusRateLimit, (req, res) => {
    const orderId = cleanText(req.body?.orderId, 20).toUpperCase();
    const phone = cleanText(req.body?.phone, 40);
    const tableNumber = cleanText(req.body?.tableNumber, 30);
    if (!/^O\d{5}$/.test(orderId)) return res.status(400).json({ message: 'Valid order id is required.' });

    const order = orders.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const authorizedByTable = order.orderType === 'dine_in' && tableNumber && order.tableNumber === tableNumber;
    const authorizedByPhone = order.orderType !== 'dine_in' && phone.length >= 5 && phone.length <= 40 && order.phone === phone;
    if (!authorizedByTable && !authorizedByPhone) return res.status(404).json({ message: 'Order not found.' });

    return res.json({
      id: order.id,
      total: order.total,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: Array.isArray(order.items)
        ? order.items.map(item => ({
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          }))
        : []
    });
  });
}
