import crypto from 'node:crypto';

const ACTION_TTL_MS = 10 * 60 * 1000;

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

const normalizePhone = (value) => {
  const raw = clean(value, 40);
  const digits = raw.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return '+971' + digits.slice(1);
  if (/^9715\d{8}$/.test(digits)) return '+' + digits;
  if (digits.length >= 7 && digits.length <= 15) return '+' + digits;
  return '';
};

function localDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const value = new Date(map.year + '-' + map.month + '-' + map.day + 'T00:00:00+04:00');
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function parseGuests(text) {
  const raw = clean(text, 500);
  const match = raw.match(/(?:لـ|ل|عدد|مع|حوالي)?\s*(\d{1,2})\s*(?:شخص|أشخاص|فرد|افراد|ضيوف)/i);
  if (match) return Number(match[1]);
  if (/شخصين|اثنين|اتنين/i.test(raw)) return 2;
  if (/ثلاثة|ثلاثه|تلاتة|ثلاث/i.test(raw)) return 3;
  if (/أربعة|اربعة|اربعه|أربع/i.test(raw)) return 4;
  if (/خمسة|خمسه|خمس/i.test(raw)) return 5;
  return null;
}

function parseTime(text) {
  const raw = clean(text, 500).toLowerCase();
  const match = raw.match(/(?:الساعة|الساعه|at)\s*(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm)?\b/i) || raw.match(/\b(\d{1,2}):([0-5]\d)\s*(ص|م|am|pm)?\b/i);
  if (!match) return '';
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = String(match[3] || '');
  if (hours > 23 || minutes > 59) return '';
  if (/م|pm/i.test(meridiem) && hours < 12) hours += 12;
  if (/ص|am/i.test(meridiem) && hours === 12) hours = 0;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function parseReservationSlots(text, memory) {
  const raw = clean(text, 1200);
  const slots = {
    name: clean(memory?.name, 80),
    phone: '',
    date: '',
    time: '',
    guests: null,
    eventSlug: '',
    customerId: ''
  };

  const phoneMatch = raw.match(/(?:05\d{8}|9715\d{8}|\+\d[\d\s-]{7,16})/);
  if (phoneMatch) slots.phone = normalizePhone(phoneMatch[0]);

  if (/اليوم/i.test(raw)) slots.date = localDate(0);
  else if (/بعد بكرة|بعد غد|بعد غدًا/i.test(raw)) slots.date = localDate(2);
  else if (/بكرة|غدا|غدًا/i.test(raw)) slots.date = localDate(1);

  const dateMatch = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (dateMatch) {
    slots.date = dateMatch[1] + '-' + String(dateMatch[2]).padStart(2, '0') + '-' + String(dateMatch[3]).padStart(2, '0');
  }

  slots.time = parseTime(raw);
  slots.guests = parseGuests(raw);

  const eventMatch = raw.match(/(?:فعالية|تجربة)\s+([a-zA-Z0-9\u0600-\u06FF_-]{2,90})/i);
  if (eventMatch) slots.eventSlug = clean(eventMatch[1], 90).toLowerCase();

  return slots;
}

function pendingIsValid(pending) {
  return Boolean(pending?.type && Number(pending.expiresAt || 0) > Date.now());
}

function confirmation(text) {
  const raw = clean(text, 200).toLowerCase();
  if (/^(نعم|ايوه|أيوه|اه|آه|تمام|موافق|وافق|أكد|تاكيد|تأكيد|نفذ|نفّذ|اعملها|اعمل|yes|ok|okay|confirm)$/i.test(raw)) return true;
  if (/^(لا|لأ|لا لا|الغى|إلغاء|الغاء|cancel|no)$/i.test(raw)) return false;
  return null;
}

export function createShamsWorkflowService({ memoryService, getOrderService, getReservationService }) {
  async function savePending(identity, type, data, idempotencyKey = '') {
    const key = clean(idempotencyKey, 100) || crypto.randomUUID();
    return memoryService.save(identity, {
      pendingAction: {
        type,
        data,
        idempotencyKey: key,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + ACTION_TTL_MS
      }
    });
  }

  async function clearPending(identity) {
    return memoryService.save(identity, { pendingAction: null });
  }

  function reservationSummary(data) {
    const missing = [];
    if (!data.name) missing.push('الاسم');
    if (!data.phone) missing.push('رقم الهاتف');
    if (!data.date) missing.push('التاريخ');
    if (!data.time) missing.push('الوقت');
    if (!Number.isInteger(data.guests) || data.guests < 1) missing.push('عدد الأشخاص');
    return { missing };
  }

  async function handleReservation({ identity, message, memory, customer }) {
    const currentPending = pendingIsValid(memory.pendingAction) && memory.pendingAction.type === 'reservation'
      ? memory.pendingAction
      : null;
    const current = currentPending?.data || {};
    const idempotencyKey = currentPending?.idempotencyKey || crypto.randomUUID();

    const effectiveMemory = { ...memory, name: memory.name || customer?.name || '' };
    const slots = parseReservationSlots(message, effectiveMemory);
    slots.customerId = String(customer?.id || '');
    if (!slots.phone && customer?.phone) slots.phone = normalizePhone(customer.phone);
    const merged = {
      ...current,
      ...Object.fromEntries(Object.entries(slots).filter(([, value]) => value !== '' && value !== null)),
      name: slots.name || current.name || memory.name || '',
      phone: slots.phone || current.phone || '',
      eventSlug: slots.eventSlug || current.eventSlug || '',
      customerId: slots.customerId || current.customerId || ''
    };

    const missing = reservationSummary(merged).missing;
    if (missing.length) {
      await savePending(identity, 'reservation', merged, idempotencyKey);
      return {
        status: 'needs_input',
        reply: 'حاضر. أحتاج ' + missing[0] + ' أولاً.',
        pending: merged
      };
    }

    await savePending(identity, 'reservation', merged, idempotencyKey);
    const summary = 'الحجز: ' + merged.name + '، ' + merged.guests + ' أشخاص، ' + merged.date + ' الساعة ' + merged.time + '.';
    return {
      status: 'awaiting_confirmation',
      reply: summary + ' أؤكد الحجز؟',
      pending: merged
    };
  }

  async function handleOrder({ identity, message, memory, cart, customer }) {
    const currentPending = pendingIsValid(memory.pendingAction) && memory.pendingAction.type === 'order'
      ? memory.pendingAction
      : null;
    const current = currentPending?.data || {};
    const idempotencyKey = currentPending?.idempotencyKey || crypto.randomUUID();

    const raw = clean(message, 1200).toLowerCase();
    const orderType = /استلام|تيك أواي|takeaway|pickup/i.test(raw)
      ? 'pickup'
      : /داخل|المطعم|طاولة|dine.?in/i.test(raw)
        ? 'dine_in'
        : current.orderType || '';

    const tableMatch = raw.match(/(?:طاولة|table)\s*(\d{1,4})/i);
    const guests = parseGuests(raw);

    const merged = {
      ...current,
      orderType,
      customerId: current.customerId || customer?.id || '',
      tableNumber: tableMatch?.[1] || current.tableNumber || '',
      name: current.name || memory.name || customer?.name || '',
      phone: current.phone || (customer?.phone ? normalizePhone(customer.phone) : ''),
      guests: guests || current.guests || null,
      items: Array.isArray(cart) ? cart.slice(0, 20) : (current.items || [])
    };

    const phoneMatch = raw.match(/(?:05\d{8}|9715\d{8}|\+\d[\d\s-]{7,16})/);
    if (phoneMatch) merged.phone = normalizePhone(phoneMatch[0]);

    if (!merged.items.length) {
      return {
        status: 'needs_cart',
        reply: 'السلة فارغة. قل لي ماذا تريد وسأبدأ بناء الطلب.'
      };
    }

    const missing = [];
    if (!merged.orderType) missing.push('هل الطلب داخل المطعم أم استلام؟');
    if (merged.orderType === 'dine_in' && !merged.tableNumber) missing.push('رقم الطاولة');
    if (merged.orderType === 'pickup' && !merged.name) missing.push('الاسم');
    if (merged.orderType === 'pickup' && !merged.phone) missing.push('رقم الهاتف');

    if (missing.length) {
      await savePending(identity, 'order', merged, idempotencyKey);
      return { status: 'needs_input', reply: missing[0], pending: merged };
    }

    await savePending(identity, 'order', merged, idempotencyKey);

    const itemSummary = merged.items
      .slice(0, 4)
      .map(item => String(Number(item.quantity || item.qty || 1)) + ' × ' + (item.nameAr || item.nameEn))
      .join('، ');

    return {
      status: 'awaiting_confirmation',
      reply: 'طلبك ' + itemSummary + '. ' +
        (merged.orderType === 'dine_in' ? 'للطاولة ' + merged.tableNumber : 'استلام باسم ' + merged.name) +
        '. أؤكد إنشاء الطلب؟',
      pending: merged
    };
  }

  async function confirmPending({ identity, memory }) {
    if (!pendingIsValid(memory.pendingAction)) {
      await clearPending(identity);
      return null;
    }

    const pending = memory.pendingAction;

    if (pending.type === 'reservation') {
      const reservationService = getReservationService?.();
      if (!reservationService) throw new Error('Reservation service unavailable.');
      const reservation = await reservationService.createReservation({
        ...pending.data,
        idempotencyKey: pending.idempotencyKey
      });
      await clearPending(identity);
      return {
        status: 'executed',
        type: 'reservation',
        reply: 'تم إنشاء الحجز بنجاح للموعد ' + reservation.date + ' الساعة ' + reservation.time + '.',
        reservation
      };
    }

    if (pending.type === 'order') {
      const orderService = getOrderService?.();
      if (!orderService) throw new Error('Order service unavailable.');
      const order = await orderService.createOrder({
        orderType: pending.data.orderType,
        tableNumber: pending.data.tableNumber,
        name: pending.data.name,
        phone: pending.data.phone,
        customerId: pending.data.customerId || '',
        sessionId: pending.data.sessionId || identity.sessionId || '',
        idempotencyKey: pending.idempotencyKey,
        items: pending.data.items.map(item => ({
          productId: item.id,
          quantity: Number(item.quantity || item.qty || 1)
        }))
      });
      await clearPending(identity);
      return {
        status: 'executed',
        type: 'order',
        reply: 'تم إنشاء طلبك ' + order.id + ' بإجمالي ' + order.total + ' درهم.',
        order
      };
    }

    await clearPending(identity);
    return null;
  }

  async function cancelPending(identity) {
    await clearPending(identity);
    return { status: 'cancelled', reply: 'تم إلغاء العملية الحالية.' };
  }

  return {
    handleReservation,
    handleOrder,
    confirmPending,
    cancelPending,
    confirmation,
    pendingIsValid
  };
}
