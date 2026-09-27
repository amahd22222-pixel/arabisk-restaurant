const TOKEN_BYTES = 32;
const MAX_SESSIONS_PER_CUSTOMER = 6;

function hashToken(value, crypto) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createProfileToken(crypto) {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return '+971' + digits.slice(1);
  if (/^9715\d{8}$/.test(digits)) return '+' + digits;
  if (digits.length >= 7 && digits.length <= 15) return '+' + digits;
  return '';
}

function sessionForCustomer(customer, tokenHash) {
  return Array.isArray(customer.profileSessions)
    ? customer.profileSessions.find(session => session?.tokenHash === tokenHash)
    : null;
}

export function createCustomerService({ repository, cleanText, crypto }) {
  const { customers } = repository;

  function listCustomers() {
    return customers.all().map(customer => ({
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      orderCount: Number(customer.orderCount || 0),
      lastOrderAt: customer.lastOrderAt || '',
      reservationCount: Number(customer.reservationCount || 0),
      lastReservationAt: customer.lastReservationAt || '',
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
    return publicProfile(customer, token);
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

  return { listCustomers, updateCustomer, saveProfile, getProfile, findByProfileToken };
}
