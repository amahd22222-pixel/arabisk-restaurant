import crypto from 'node:crypto';

const ACTION_TTL_MS = 10 * 60 * 1000;

const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

const toWesternDigits = value => String(value ?? '').replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const normalizePhone = (value) => {
  const raw = clean(toWesternDigits(value), 40);
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
  const raw = clean(toWesternDigits(text), 500).toLowerCase()
    .replace(/اتنين/g, 'اثنين')
    .replace(/تلاته|تلاتة/g, 'ثلاثة')
    .replace(/اربعه|اربعة/g, 'أربعة')
    .replace(/خمسه|خمسة/g, 'خمسة')
    .replace(/سته/g, 'ستة')
    .replace(/سبعه/g, 'سبعة')
    .replace(/تمانية|تمنية/g, 'ثمانية')
    .replace(/تسعه/g, 'تسعة');
  const match = raw.match(/(?:لـ|ل|عدد|مع|حوالي)?\s*(\d{1,2})\s*(?:شخص|أشخاص|فرد|افراد|ضيوف|اشخاص)/i);
  if (match) return Number(match[1]);
  const words = [
    [/شخص(?:ين)?|اثنين|اتنين/i, 2],
    [/ثلاثة|ثلاثه|تلاتة|ثلاث/i, 3],
    [/أربعة|اربعة|اربعه|أربع/i, 4],
    [/خمسة|خمسه|خمس/i, 5],
    [/ستة|سته|ست/i, 6],
    [/سبعة|سبعه|سبع/i, 7],
    [/ثمانية|تمانية|تمنية|ثماني/i, 8],
    [/تسعة|تسعه|تسع/i, 9],
    [/عشرة|عشر/i, 10]
  ];
  for (const [pattern, value] of words) {
    if (pattern.test(raw)) return value;
  }
  return null;
}

function parseTime(text) {
  const raw = clean(toWesternDigits(text), 500).toLowerCase()
    .replace(/الساعه|ساعة/g, 'الساعة')
    .replace(/مساءً|مساء|بالليل|ليل/g, 'م')
    .replace(/صباحًا|صباحا|الصبح|صباح/g, 'ص');

  const hourWords = [
    [/الواحدة|واحده|واحدة/i, 1], [/الاثنين|اتنين|اثنين/i, 2], [/الثلاثة|تلاتة|ثلاثه/i, 3],
    [/الأربعة|اربعة|اربعه/i, 4], [/الخمسة|خمسه|خمسة/i, 5], [/الستة|سته|ستة/i, 6],
    [/السبعة|سبعه|سبعة/i, 7], [/الثمانية|تمانية|تمنية|ثمانية/i, 8],
    [/التسعة|تسعه|تسعة/i, 9], [/العشرة|عشرة/i, 10], [/الحادية عشر|حداشر/i, 11],
    [/الثانية عشر|اتناشر|اثنا عشر/i, 12]
  ];

  let hourValue = null;
  for (const [pattern, value] of hourWords) {
    if (pattern.test(raw)) {
      hourValue = value;
      break;
    }
  }

  const match = raw.match(/(?:الساعة|at)\s*(\d{1,2})(?:[:.]([0-5]\d))?\s*(ونصف|و نص|و\s*30)?\s*(ص|م|am|pm)?/i)
    || raw.match(/\b(\d{1,2})(?:[:.]([0-5]\d))?\s*(ونصف|و نص|و\s*30)?\s*(ص|م|am|pm)/i);

  let hours = hourValue;
  let minutes = 0;
  let meridiem = '';

  if (match) {
    hours = Number(match[1]);
    minutes = Number(match[2] || 0);
    if (match[3]) minutes = 30;
    meridiem = String(match[4] || '');
  } else {
    const wordMatch = raw.match(/(?:الساعة|at)\s*(?:الواحدة|واحده|واحدة|الاثنين|اتنين|اثنين|الثلاثة|تلاتة|ثلاثه|الأربعة|اربعة|اربعه|الخمسة|خمسه|خمسة|الستة|سته|ستة|السبعة|سبعه|سبعة|الثمانية|تمانية|تمنية|ثمانية|التسعة|تسعه|تسعة|العشرة|عشرة|الحادية عشر|حداشر|الثانية عشر|اتناشر|اثنا عشر)(?:\s*(ونصف|و نص))?\s*(ص|م|am|pm)?/i);
    if (!wordMatch || hours === null) return '';
    if (wordMatch[1]) minutes = 30;
    meridiem = String(wordMatch[2] || '');
  }

  if (hours > 23 || minutes > 59) return '';
  if (/م|pm/i.test(meridiem) && hours < 12) hours += 12;
  if (/ص|am/i.test(meridiem) && hours === 12) hours = 0;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function parseReservationSlots(text, memory) {
  const raw = clean(toWesternDigits(text), 1200);
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

  if (/اليوم|هلق|هلا|دلوقتي|دلوقت/i.test(raw)) slots.date = localDate(0);
  else if (/بعد بكرة|بعد غد|بعد غدًا/i.test(raw)) slots.date = localDate(2);
  else if (/بكرة|بكره|غدا|غدًا/i.test(raw)) slots.date = localDate(1);

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
  if (/^(نعم|ايوه|أيوه|اه|آه|تمام|موافق|وافق|أكيد|اكيد|ايوا|يلا|خلاص|تم|أكد|تاكيد|تأكيد|نفذ|نفّذ|اعملها|اعمل|اعملي|خلص|خلصها|yes|ok|okay|confirm)$/i.test(raw)) return true;
  if (/^(لا|لأ|لا لا|مش موافق|مو موافق|الغى|إلغاء|الغاء|ما بدي|ما بديها|لا خلص|cancel|no)$/i.test(raw)) return false;
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

  async function handleReservation({ identity, message, memory, customer, hints = {} }) {
    const currentPending = pendingIsValid(memory.pendingAction) && memory.pendingAction.type === 'reservation'
      ? memory.pendingAction
      : null;
    const current = currentPending?.data || {};
    const idempotencyKey = currentPending?.idempotencyKey || crypto.randomUUID();

    const effectiveMemory = { ...memory, name: memory.name || customer?.name || '' };
    const parsedSlots = parseReservationSlots(message, effectiveMemory);
    const slots = {
      ...parsedSlots,
      date: clean(hints.date || '', 40) || parsedSlots.date,
      time: clean(hints.time || '', 20) || parsedSlots.time,
      guests: Number.isInteger(Number(hints.guests)) && Number(hints.guests) > 0 ? Number(hints.guests) : parsedSlots.guests,
      eventSlug: clean(hints.eventSlug || '', 90) || parsedSlots.eventSlug,
      name: clean(hints.name || '', 80) || parsedSlots.name,
      phone: normalizePhone(hints.phone || '') || parsedSlots.phone
    };
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

  async function handleOrder({ identity, message, memory, cart, customer, hints = {} }) {
    const currentPending = pendingIsValid(memory.pendingAction) && memory.pendingAction.type === 'order'
      ? memory.pendingAction
      : null;
    const current = currentPending?.data || {};
    const idempotencyKey = currentPending?.idempotencyKey || crypto.randomUUID();

    const raw = clean(message, 1200).toLowerCase();
    const hintedOrderType = clean(hints.orderType || '', 30).toLowerCase();
    const orderType = /pickup|takeaway|استلام|تيك/.test(hintedOrderType) || /استلام|تيك أواي|تيك اواي|takeaway|pickup/i.test(raw)
      ? 'pickup'
      : /dine_in|داخل|المطعم|طاولة|dine.?in/.test(hintedOrderType) || /داخل|المطعم|طاولة|dine.?in/i.test(raw)
        ? 'dine_in'
        : current.orderType || '';

    const tableMatch = raw.match(/(?:طاولة|table)\s*(\d{1,4})/i);
    const guests = Number.isInteger(Number(hints.guests)) && Number(hints.guests) > 0 ? Number(hints.guests) : parseGuests(raw);

    const merged = {
      ...current,
      orderType,
      customerId: current.customerId || customer?.id || '',
      tableNumber: clean(hints.tableNumber || '', 20) || tableMatch?.[1] || current.tableNumber || '',
      name: clean(hints.name || '', 80) || current.name || memory.name || customer?.name || '',
      phone: normalizePhone(hints.phone || '') || current.phone || (customer?.phone ? normalizePhone(customer.phone) : ''),
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
