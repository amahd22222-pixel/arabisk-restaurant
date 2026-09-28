import { normalizePhone } from '../utils/phone.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function maxIso(...values) {
  return values
    .map(value => String(value || ''))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
}

function lifecycleFor(customer) {
  const orders = safeNumber(customer.orderCount);
  const reservations = safeNumber(customer.reservationCount);
  if (!orders && !reservations) return { key: 'new', label: 'جديد' };

  const last = Date.parse(customer.lastActivityAt || '');
  if (!Number.isFinite(last)) return { key: 'active', label: 'نشط' };

  const age = Math.max(0, Math.floor((Date.now() - last) / DAY_MS));
  if (age <= 30) return { key: 'active', label: 'نشط' };
  if (age <= 90) return { key: 'dormant', label: 'خامل' };
  return { key: 'lapsed', label: 'غير نشط' };
}

function customerMatches(item, customer) {
  if (!item || !customer) return false;
  if (item.customerId && String(item.customerId) === String(customer.id)) return true;
  const itemPhone = normalizePhone(item.phone);
  const customerPhone = normalizePhone(customer.phone);
  return Boolean(itemPhone && customerPhone && itemPhone === customerPhone);
}

export function createCustomerRelationshipService({ repository }) {
  const { customers, orders, reservations, products, notificationDevices } = repository;

  function collectCustomerData(customer) {
    const linkedOrders = orders.filter(order => customerMatches(order, customer));
    const completedOrders = linkedOrders.filter(order => order?.status === 'completed');

    const linkedReservations = reservations.filter(item => customerMatches(item, customer));
    const activeReservations = linkedReservations.filter(item => item?.status !== 'cancelled');
    const futureReservations = activeReservations
      .filter(item => item?.status !== 'cancelled' && item?.date && new Date(item.date + 'T' + String(item.time || '00:00')).getTime() >= Date.now())
      .sort((a, b) => String(a.date + 'T' + a.time).localeCompare(String(b.date + 'T' + b.time)));

    const spend = Math.round(completedOrders.reduce((sum, order) => sum + safeNumber(order.total), 0) * 100) / 100;

    const productCounts = new Map();
    const categoryCounts = new Map();
    const productById = new Map(products.map(product => [String(product.id), product]));
    for (const order of completedOrders) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const key = String(item?.productId || item?.nameAr || '').trim();
        if (!key) continue;
        const quantity = Math.max(0, Math.round(safeNumber(item?.quantity)));
        const row = productCounts.get(key) || { productId: key, name: String(item?.nameAr || item?.nameEn || key), quantity: 0 };
        row.quantity += quantity;
        productCounts.set(key, row);

        const product = productById.get(String(item?.productId || ''));
        const categoryId = product?.categoryId || item?.categoryId || '';
        const categoryName = product?.categoryNameAr || product?.categoryName || item?.categoryNameAr || item?.categoryName || categoryId;
        if (categoryId && quantity > 0) {
          const category = categoryCounts.get(String(categoryId)) || { categoryId: String(categoryId), name: String(categoryName || categoryId), quantity: 0 };
          category.quantity += quantity;
          if (!category.name || category.name === category.categoryId) category.name = String(categoryName || category.categoryId);
          categoryCounts.set(String(categoryId), category);
        }
      }
    }

    const favoriteProducts = [...productCounts.values()]
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'ar'))
      .slice(0, 5);

    const totalOrderValue = spend;
    const firstSeenAt = customer.firstSeenAt || customer.appProfileCreatedAt || customer.createdAt || maxIso(
      ...linkedOrders.map(item => item.createdAt),
      ...linkedReservations.map(item => item.createdAt)
    );
    const lastActivityAt = maxIso(
      customer.lastActivityAt,
      customer.lastOrderAt,
      customer.lastReservationAt,
      ...linkedOrders.map(item => item.completedAt || item.updatedAt || item.createdAt),
      ...linkedReservations.map(item => item.createdAt)
    );

    const lifecycle = lifecycleFor({
      ...customer,
      orderCount: completedOrders.length,
      reservationCount: activeReservations.length,
      lastActivityAt
    });

    const deviceCount = Array.isArray(notificationDevices)
      ? notificationDevices.filter(item => item?.status !== 'uninstalled' && item?.customerId && String(item.customerId) === String(customer.id)).length
      : 0;

    return {
      linkedOrders,
      completedOrders,
      linkedReservations,
      futureReservations,
      totalOrderValue,
      favoriteProducts,
      favoriteCategories: [...categoryCounts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      firstSeenAt,
      lastActivityAt,
      lifecycle,
      deviceCount,
      profileSessionCount: Array.isArray(customer.profileSessions) ? customer.profileSessions.length : 0,
      nextReservation: futureReservations[0] || null
    };
  }

  function summarizeCustomer(customer) {
    const data = collectCustomerData(customer);
    return {
      id: customer.id,
      name: customer.name || 'عميل',
      phone: normalizePhone(customer.phone) || customer.phone || '',
      appMember: customer.appMember === true,
      phoneVerified: customer.phoneVerified === true,
      firstSeenAt: data.firstSeenAt,
      lastActivityAt: data.lastActivityAt,
      orderCount: data.completedOrders.length,
      reservationCount: data.linkedReservations.filter(item => item?.status !== 'cancelled').length,
      totalOrderValue: data.totalOrderValue,
      averageOrderValue: data.completedOrders.length ? Math.round((data.totalOrderValue / data.completedOrders.length) * 100) / 100 : 0,
      lifecycleKey: data.lifecycle.key,
      lifecycleLabel: data.lifecycle.label,
      favoriteProduct: data.favoriteProducts[0]?.name || '',
      favoriteCategory: data.favoriteCategories[0]?.name || '',
      deviceCount: data.deviceCount
    };
  }

  function summary() {
    const all = customers.all().map(summarizeCustomer);
    const now = Date.now();
    const within = days => all.filter(item => {
      const timestamp = Date.parse(item.lastActivityAt || '');
      return Number.isFinite(timestamp) && now - timestamp <= days * DAY_MS;
    });

    const newCustomers = all.filter(item => {
      const timestamp = Date.parse(item.firstSeenAt || '');
      return Number.isFinite(timestamp) && now - timestamp <= 7 * DAY_MS;
    });

    const active = within(30);
    const dormant = all.filter(item => item.lifecycleKey === 'dormant');
    const lapsed = all.filter(item => item.lifecycleKey === 'lapsed');
    const appMembers = all.filter(item => item.appMember);
    const linkedDevices = all.reduce((sum, item) => sum + Number(item.deviceCount || 0), 0);
    const totalSpend = Math.round(all.reduce((sum, item) => sum + safeNumber(item.totalOrderValue), 0) * 100) / 100;

    return {
      generatedAt: new Date().toISOString(),
      identity: {
        primaryKey: 'phone + customerId',
        emailRequired: false,
        note: 'البريد الإلكتروني غير مطلوب وغير مستخدم كحقل تعريف للعميل.'
      },
      counts: {
        total: all.length,
        new7d: newCustomers.length,
        active30d: active.length,
        dormant31to90d: dormant.length,
        lapsed90dPlus: lapsed.length,
        appMembers: appMembers.length,
        registeredDevices: linkedDevices
      },
      value: {
        totalCompletedOrderValue: totalSpend,
        customersWithOrders: all.filter(item => item.orderCount > 0).length,
        customersWithReservations: all.filter(item => item.reservationCount > 0).length
      },
      topCustomers: all
        .filter(item => item.orderCount > 0 || item.reservationCount > 0)
        .sort((a, b) => b.totalOrderValue - a.totalOrderValue || b.orderCount - a.orderCount)
        .slice(0, 10),
      customers: all
    };
  }

  function customerRelationship(id) {
    const customer = customers.findById(id);
    if (!customer) return null;
    const data = collectCustomerData(customer);
    return {
      customer: summarizeCustomer(customer),
      profile: {
        internalNotes: customer.internalNotes || '',
        privacyConsentAt: customer.privacyConsentAt || '',
        appProfileCreatedAt: customer.appProfileCreatedAt || '',
        appProfileUpdatedAt: customer.appProfileUpdatedAt || ''
      },
      relationship: {
        lifecycle: data.lifecycle,
        firstSeenAt: data.firstSeenAt,
        lastActivityAt: data.lastActivityAt,
        totalOrderValue: data.totalOrderValue,
        averageOrderValue: data.completedOrders.length ? Math.round((data.totalOrderValue / data.completedOrders.length) * 100) / 100 : 0,
        orders: data.completedOrders.slice().sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')).slice(0, 20),
        reservations: data.linkedReservations.filter(item => item?.status !== 'cancelled').slice().sort((a, b) => String(b.date + 'T' + b.time).localeCompare(String(a.date + 'T' + a.time))).slice(0, 20),
        upcomingReservation: data.nextReservation,
        favoriteProducts: data.favoriteProducts,
        favoriteCategories: data.favoriteCategories,
        registeredDeviceCount: data.deviceCount,
        profileSessionCount: data.profileSessionCount
      }
    };
  }

  return { summary, customerRelationship };
}
