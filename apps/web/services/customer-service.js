import { normalizePhone } from '../utils/phone.js';

const TOKEN_BYTES = 32;
const MAX_SESSIONS_PER_CUSTOMER = 6;

function hashToken(value, crypto) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createProfileToken(crypto) {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function sessionForCustomer(customer, tokenHash) {
  return Array.isArray(customer.profileSessions)
    ? customer.profileSessions.find(session => session?.tokenHash === tokenHash)
    : null;
}

export function createCustomerService({ repository, cleanText, crypto }) {
  const { customers, orders, reservations } = repository;

  function lifecycleFor(customer) {
    const hasOrders = Number(customer?.orderCount || 0) > 0;
    const hasReservations = Number(customer?.reservationCount || 0) > 0;
    if (!hasOrders && !hasReservations) return { key: 'new', label: 'جديد' };
    const last = Date.parse(customer?.lastActivityAt || customer?.lastOrderAt || customer?.lastReservationAt || '');
    if (!Number.isFinite(last)) return { key: 'active', label: 'نشط' };
    const ageDays = Math.max(0, Math.floor((Date.now() - last) / 86400000));
    if (ageDays <= 30) return { key: 'active', label: 'نشط' };
    if (ageDays <= 90) return { key: 'dormant', label: 'خامل' };
    return { key: 'lapsed', label: 'غير نشط' };
  }


  function listCustomers() {
    return customers.all().map(customer => ({
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      orderCount: Number(customer.orderCount || 0),
      lastOrderAt: customer.lastOrderAt || '',
      reservationCount: Number(customer.reservationCount || 0),
      lastReservationAt: customer.lastReservationAt || '',
      totalOrderValue: Number(customer.totalOrderValue || 0),
      firstSeenAt: customer.firstSeenAt || customer.appProfileCreatedAt || customer.createdAt || '',
      lastActivityAt: customer.lastActivityAt || customer.lastOrderAt || customer.lastReservationAt || '',
      lifecycleKey: lifecycleFor(customer).key,
      lifecycleLabel: lifecycleFor(customer).label,
      phoneVerified: customer.phoneVerified === true,
      appMember: customer.appMember === true,
      privacyConsentAt: customer.privacyConsentAt || '',
      appProfileCreatedAt: customer.appProfileCreatedAt || '',
      appProfileUpdatedAt: customer.appProfileUpdatedAt || ''
    }));
  }

  function findByProfileToken(token) {
    const tokenHash = hashToken(token, crypto);
    if (!tokenHash || tokenHash.length !== 64) return null;
    const customer = customers.find(item => sessionForCustomer(item, tokenHash));
    return customer || null;
  }

  function publicProfile(customer, profileToken) {
    return {
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      phoneVerified: customer.phoneVerified === true,
      profileToken
    };
  }

  async function saveProfile(body, existingToken = '') {
    const name = cleanText(body?.name, 80);
    const phone = normalizePhone(body?.phone);
    const deviceId = cleanText(body?.deviceId, 120);
    const privacyConsent = body?.privacyConsent === true;
    if (name.length < 2) {
      const error = new Error('أدخل اسمك بشكل صحيح.');
      error.status = 400;
      throw error;
    }
    if (!phone) {
      const error = new Error('أدخل رقم هاتف صحيح.');
      error.status = 400;
      throw error;
    }
    if (!privacyConsent) {
      const error = new Error('الموافقة على سياسة الخصوصية مطلوبة لإنشاء الحساب.');
      error.status = 400;
      throw error;
    }

    const suppliedHash = existingToken ? hashToken(existingToken, crypto) : '';
    let customer = suppliedHash ? findByProfileToken(existingToken) : null;
    if (!customer) customer = customers.findByPhone?.(phone) || customers.find(item => item.phone === phone) || null;

    const now = new Date().toISOString();
    let profileToken = existingToken || '';
    let before = customer ? structuredClone(customer) : null;

    if (!customer) {
      profileToken = createProfileToken(crypto);
      const customerId = crypto.randomUUID();
      customer = customers.add({
        id: customerId,
        name,
        phone,
        orderCount: 0,
        lastOrderAt: '',
        reservationCount: 0,
        lastReservationAt: '',
        totalOrderValue: 0,
        firstSeenAt: now,
        lastActivityAt: now,
        phoneVerified: false,
        appMember: true,
        privacyConsentAt: now,
        appProfileCreatedAt: now,
        appProfileUpdatedAt: now,
        profileSessions: [{ tokenHash: hashToken(profileToken, crypto), createdAt: now, lastSeenAt: now, deviceId }]
      });
    } else {
      if (!profileToken) {
        profileToken = createProfileToken(crypto);
        customer.profileSessions = Array.isArray(customer.profileSessions) ? customer.profileSessions : [];
        customer.profileSessions.push({ tokenHash: hashToken(profileToken, crypto), createdAt: now, lastSeenAt: now, deviceId });
      } else {
        const session = sessionForCustomer(customer, suppliedHash);
        if (session) {
          session.lastSeenAt = now;
          if (deviceId) session.deviceId = deviceId;
        }
      }
      customer.name = name;
      customer.phone = phone;
      customer.appMember = true;
      customer.phoneVerified = customer.phoneVerified === true;
      customer.privacyConsentAt = customer.privacyConsentAt || now;
      customer.appProfileUpdatedAt = now;
      customer.lastActivityAt = now;
      customer.firstSeenAt = customer.firstSeenAt || customer.appProfileCreatedAt || now;
      customer.profileSessions = (customer.profileSessions || []).slice(-MAX_SESSIONS_PER_CUSTOMER);
    }

    try {
      await customers.save();
    } catch (error) {
      if (customer && before) Object.assign(customer, before);
      else customers.removeById(customer.id);
      throw error;
    }

    return publicProfile(customer, profileToken);
  }

  function getProfile(token) {
    const customer = findByProfileToken(token);
    if (!customer) {
      const error = new Error('جلسة العميل غير صالحة.');
      error.status = 401;
      throw error;
    }
    const tokenHash = hashToken(token, crypto);
    const session = sessionForCustomer(customer, tokenHash);
    if (session) session.lastSeenAt = new Date().toISOString();
    customer.lastActivityAt = new Date().toISOString();
    void customers.save().catch(() => {});
    return publicProfile(customer, token);
  }

  function profileDashboard(token) {
    const customer = findByProfileToken(token);
    if (!customer) {
      const error = new Error('جلسة العميل غير صالحة.');
      error.status = 401;
      throw error;
    }

    const customerId = customer.id;
    const customerOrders = orders
      .all()
      .filter(order => order?.customerId === customerId)
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));

    const customerReservations = reservations
      .all()
      .filter(reservation => reservation?.customerId === customerId)
      .sort((a, b) => {
        const aKey = String(a?.date || '') + 'T' + String(a?.time || '');
        const bKey = String(b?.date || '') + 'T' + String(b?.time || '');
        return bKey.localeCompare(aKey);
      });

    const publicOrder = order => ({
      id: String(order?.id || ''),
      status: String(order?.status || 'pending'),
      orderType: order?.orderType === 'pickup' ? 'pickup' : 'dine_in',
      tableNumber: String(order?.tableNumber || ''),
      total: Number(order?.total || 0),
      createdAt: String(order?.createdAt || ''),
      updatedAt: String(order?.updatedAt || ''),
      itemCount: Array.isArray(order?.items)
        ? order.items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0)
        : 0,
      items: Array.isArray(order?.items)
        ? order.items.slice(0, 4).map(item => ({
            nameAr: cleanText(item?.nameAr, 160),
            quantity: Number(item?.quantity) || 0
          }))
        : []
    });

    const publicReservation = reservation => ({
      id: String(reservation?.id || ''),
      status: String(reservation?.status || 'pending'),
      date: String(reservation?.date || ''),
      time: String(reservation?.time || ''),
      guests: Number(reservation?.guests || 0),
      notes: cleanText(reservation?.notes, 300),
      eventSlug: cleanText(reservation?.eventSlug, 90)
    });

    return {
      profile: publicProfile(customer, token),
      stats: {
        orderCount: Number(customer.orderCount || 0),
        reservationCount: Number(customer.reservationCount || 0),
        totalOrderValue: Number(customer.totalOrderValue || 0),
        memberSince: customer.appProfileCreatedAt || customer.firstSeenAt || customer.createdAt || '',
        lastActivityAt: customer.lastActivityAt || customer.lastOrderAt || customer.lastReservationAt || ''
      },
      orders: customerOrders.slice(0, 5).map(publicOrder),
      reservations: customerReservations.slice(0, 5).map(publicReservation)
    };
  }

  async function updateCustomer(id, body) {
    const customer = customers.findById(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.status = 404;
      throw error;
    }

    const before = structuredClone(customer);

    if (body?.internalNotes !== undefined) {
      customer.internalNotes = cleanText(body.internalNotes, 2000);
      customer.internalNotesUpdatedAt = new Date().toISOString();
    }

    try {
      await customers.save();
    } catch (error) {
      Object.assign(customer, before);
      throw error;
    }

    return {
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      internalNotes: customer.internalNotes || '',
      internalNotesUpdatedAt: customer.internalNotesUpdatedAt || ''
    };
  }

  return { listCustomers, updateCustomer, saveProfile, getProfile, findByProfileToken, profileDashboard };
}
