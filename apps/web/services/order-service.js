const ORDER_STATUS_TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['completed', 'cancelled']),
  completed: new Set([]),
  cancelled: new Set([])
};

class OrderServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'OrderServiceError';
    this.status = status;
  }
}

export function createOrderService({ repository, cleanText, nextOrderId, invalidateSmartSnapshot, revenue, crypto }) {
  const { orders, products, customers } = repository;

  function getOrThrow(id) {
    const order = orders.findById(id);
    if (!order) throw new OrderServiceError('Order not found', 404);
    return order;
  }

  async function updateOrder(id, body) {
    const order = getOrThrow(id);
    const beforeOrder = structuredClone(order);
    let beforeCustomer = null;
    let changedCustomer = null;
    const now = new Date().toISOString();

    if (body?.status !== undefined) {
      const nextStatus = String(body.status);
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.has(nextStatus)) {
        throw new OrderServiceError(
          'Invalid order status transition: ' + order.status + ' -> ' + nextStatus,
          409
        );
      }

      order.status = nextStatus;

      if (nextStatus === 'completed') {
        order.completedAt = order.completedAt || now;
        if (order.orderType === 'pickup' && order.phone) {
          const customer = customers.findByPhone(order.phone);
          if (customer) {
            changedCustomer = customer;
            beforeCustomer = structuredClone(customer);
            customer.name = cleanText(order.name, 80);
            customer.orderCount = Number(customer.orderCount || 0) + 1;
            customer.lastOrderAt = order.completedAt;
          }
        }
      }
    }

    if (body?.notes !== undefined) order.notes = cleanText(body.notes, 300);
    order.updatedAt = now;

    try {
      await orders.save();
    } catch (error) {
      Object.assign(order, beforeOrder);
      if (changedCustomer && beforeCustomer) Object.assign(changedCustomer, beforeCustomer);
      throw error;
    }

    invalidateSmartSnapshot();

    if (order.status === 'completed' && beforeOrder.status !== 'completed') {
      const completedCustomerId = changedCustomer?.id || '';
      revenue.recordEvent({
        eventName: 'order_completed',
        sessionId: cleanText(order.sessionId, 100),
        customerId: completedCustomerId,
        orderId: order.id,
        orderValue: order.total,
        metadata: { orderType: order.orderType }
      });
    }

    return order;
  }

  async function createOrder(body) {
    const orderType = ['dine_in', 'pickup'].includes(body.orderType) ? body.orderType : 'dine_in';
    const tableNumber = orderType === 'dine_in' ? cleanText(body.tableNumber, 30) : '';
    const name = cleanText(body.name, 80);
    const phone = cleanText(body.phone, 40);
    const notes = cleanText(body.notes, 300);
    const recoveryToken = cleanText(body.recoveryToken, 80);
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!rawItems.length || rawItems.length > 30) throw new OrderServiceError('At least one order item is required');
    if (orderType === 'dine_in' && !tableNumber) throw new OrderServiceError('Table number is required for dine-in orders.');
    if (orderType === 'pickup' && (!name || phone.length < 5 || phone.length > 40)) throw new OrderServiceError('name and phone are required for pickup orders');

    const merged = new Map();
    for (const raw of rawItems) {
      const productId = cleanText(raw?.productId, 40);
      const quantity = Number(raw?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new OrderServiceError('Invalid order item.');
      const mergedQuantity = (merged.get(productId) || 0) + quantity;
      if (mergedQuantity > 20) throw new OrderServiceError('Maximum quantity for a single item is 20.');
      merged.set(productId, mergedQuantity);
    }

    const items = [];
    let total = 0;
    for (const [productId, quantity] of merged) {
      const product = products.find(item => item.id === productId && item.available !== false);
      if (!product) throw new OrderServiceError('One or more selected items are no longer available.');
      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new OrderServiceError('Invalid product price.');
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
    const order = {
      id: nextOrderId(),
      name: orderType === 'dine_in' ? 'طاولة ' + tableNumber : name,
      phone: orderType === 'dine_in' ? '' : phone,
      orderType,
      tableNumber,
      notes,
      items,
      total,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      sessionId: cleanText(body.sessionId, 100),
      revenueRecoveryToken: recoveryToken,
      completedAt: ''
    };

    let orderCustomerId = '';
    let existingCustomer = null;
    let beforeCustomer = null;

    if (orderType === 'pickup' && phone) {
      existingCustomer = customers.findByPhone(phone);
      if (existingCustomer) {
        orderCustomerId = existingCustomer.id;
        beforeCustomer = structuredClone(existingCustomer);
        existingCustomer.name = name;
      } else {
        orderCustomerId = crypto.randomUUID();
        customers.add({ id: orderCustomerId, name, phone, orderCount: 0, lastOrderAt: '' });
      }
    }

    orders.add(order);

    try {
      await orders.save();
    } catch (error) {
      orders.removeById(order.id);
      if (existingCustomer && beforeCustomer) {
        Object.assign(existingCustomer, beforeCustomer);
      } else if (!existingCustomer && orderCustomerId) {
        customers.removeById(orderCustomerId);
      }
      throw error;
    }

    invalidateSmartSnapshot();

    revenue.recordEvent({
      eventName: 'order_created',
      sessionId: cleanText(body.sessionId, 100),
      customerId: orderCustomerId,
      orderId: order.id,
      orderValue: order.total,
      metadata: { orderType }
    });
    if (recoveryToken) revenue.recordRecoveryOrder(recoveryToken, order.id);
    return order;
  }

  function getPublicStatus(body) {
    const orderId = cleanText(body.orderId, 20).toUpperCase();
    const phone = cleanText(body.phone, 40);
    const tableNumber = cleanText(body.tableNumber, 30);
    if (!/^O\d{5}$/.test(orderId)) throw new OrderServiceError('Valid order id is required.');
    const order = orders.findById(orderId);
    if (!order) throw new OrderServiceError('Order not found.', 404);
    const authorizedByTable = order.orderType === 'dine_in' && tableNumber && order.tableNumber === tableNumber;
    const authorizedByPhone = order.orderType !== 'dine_in' && phone.length >= 5 && phone.length <= 40 && order.phone === phone;
    if (!authorizedByTable && !authorizedByPhone) throw new OrderServiceError('Order not found.', 404);
    return {
      id: order.id,
      total: order.total,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: Array.isArray(order.items)
        ? order.items.map(item => ({ nameAr: item.nameAr, nameEn: item.nameEn, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal }))
        : []
    };
  }

  return { listOrders: () => orders.all(), updateOrder, createOrder, getPublicStatus };
}