import crypto from 'node:crypto';

const REVENUE_STATE_KEY = 'data/arabisk-revenue-v1.json';
const MAX_EVENTS = 8000;
const MAX_CAMPAIGNS = 1000;
const ALLOWED_EVENTS = new Set([
  'menu_view',
  'item_view',
  'add_to_cart',
  'cart_updated',
  'checkout_started',
  'order_created',
  'order_completed',
  'reservation_created'
]);

const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(number(value))));
const priority = score => score >= 75 ? { label: 'عالية', key: 'high' } : score >= 50 ? { label: 'متوسطة', key: 'medium' } : { label: 'منخفضة', key: 'low' };
const ageMinutes = (now, iso) => {
  const age = now - Date.parse(iso || '');
  return Number.isFinite(age) ? Math.max(0, Math.floor(age / 60000)) : 0;
};
const ageLabel = minutes => minutes < 60 ? `${minutes} دقيقة` : minutes < 1440 ? `${Math.floor(minutes / 60)} ساعة` : `${Math.floor(minutes / 1440)} يوم`;
const orderCompletionTimestamp = order => order?.completedAt || order?.updatedAt || order?.createdAt || '';
const OUTCOME_REASON_DEFINITIONS = {
  converted_to_order: 'تحول إلى طلب فعلي',
  manual_conversion: 'تحول مسجل يدويًا',
  completed_no_conversion: 'تم التنفيذ بدون تحول',
  customer_unresponsive: 'لم يرد العميل',
  not_interested: 'العميل غير مهتم',
  not_relevant: 'العرض غير مناسب',
  operational_issue: 'عائق تشغيلي',
  timing: 'التوقيت غير مناسب',
  duplicate: 'مكرر / تمت معالجته سابقًا',
  other: 'سبب آخر',
  unclassified: 'غير مصنف'
};
const outcomeReasonLabel = key => OUTCOME_REASON_DEFINITIONS[key] || OUTCOME_REASON_DEFINITIONS.unclassified;
const BLOCKER_TYPE_DEFINITIONS = {
  customer_response: 'انتظار رد العميل',
  owner_unavailable: 'المسؤول غير متاح',
  approval: 'انتظار موافقة',
  inventory: 'المخزون / توفر المنتج',
  pricing: 'السعر / العرض يحتاج تعديل',
  technical: 'مشكلة تقنية',
  dependency: 'اعتماد على مهمة أو طرف آخر',
  capacity: 'القدرة التشغيلية غير كافية',
  other: 'عائق آخر'
};
const blockerTypeLabel = key => BLOCKER_TYPE_DEFINITIONS[key] || BLOCKER_TYPE_DEFINITIONS.other;



const taskWorkflow = (campaign, now = Date.now()) => {
  if (campaign.status !== 'draft') {
    return {
      key:'done',
      label:'مكتملة',
      overdue:false,
      escalated:false,
      overdueHours:0,
      dueHoursRemaining:null,
      riskKey:'done',
      riskLabel:'مغلقة',
      riskScore:0,
      nextAction:'راجع النتيجة والإيراد المقاس عند الحاجة.'
    };
  }
  const dueAt = Date.parse(campaign.dueAt || '');
  const dueHoursRemaining = Number.isFinite(dueAt) ? Math.round(((dueAt - now) / 3600000) * 10) / 10 : null;
  const state = clean(campaign.workflowStatus, 30);
  if (state === 'blocked') {
    return {
      key:'blocked',
      label:'محجوبة',
      overdue:false,
      escalated:false,
      overdueHours:0,
      dueHoursRemaining,
      blockerReason: clean(campaign.blockerReason, 240) || 'يوجد عائق تشغيلي يحتاج معالجة.',
      blockerType: clean(campaign.blockerType, 40) || 'other',
      blockerTypeLabel: blockerTypeLabel(clean(campaign.blockerType, 40) || 'other'),
      blockedAt: clean(campaign.blockedAt, 40),
      resolvedAt: clean(campaign.resolvedAt, 40),
      blockedDurationHours: Number.isFinite(Date.parse(campaign.blockedAt || '')) ? Math.max(0, Math.round(((now - Date.parse(campaign.blockedAt || '')) / 3600000) * 10) / 10) : 0,
      riskKey:'high',
      riskLabel:'مخاطرة عالية',
      riskScore:85,
      nextAction:'حل العائق المسجل، ثم أعد المهمة إلى مسندة أو قيد التنفيذ.'
    };
  }
  if (Number.isFinite(dueAt) && dueAt < now) {
    const overdueHours = Math.max(0, Math.floor((now - dueAt) / 3600000));
    const escalated = overdueHours >= 24;
    return {
      key: escalated ? 'escalated' : 'overdue',
      label: escalated ? 'تصعيد مطلوب' : 'متأخرة',
      overdue:true,
      escalated,
      overdueHours,
      dueHoursRemaining,
      riskKey:'high',
      riskLabel:'مخاطرة عالية',
      riskScore:escalated ? 100 : 90,
      nextAction: escalated
        ? 'راجع المسؤول فورًا، حدّث الحالة وسجّل الإجراء المتخذ.'
        : 'حدّث الـSLA أو ابدأ التنفيذ وسجّل النتيجة.'
    };
  }
  if (state === 'in_progress') return {
    key:'in_progress',
    label:'قيد التنفيذ',
    overdue:false,
    escalated:false,
    overdueHours:0,
    dueHoursRemaining,
    riskKey:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 'high' : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 'medium' : 'low',
    riskLabel:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 'مخاطرة عالية' : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 'مخاطرة متوسطة' : 'مخاطرة منخفضة',
    riskScore:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 80 : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 55 : 30,
    nextAction:dueHoursRemaining !== null && dueHoursRemaining <= 4
      ? 'أكمل التنفيذ الآن لتفادي تجاوز الـSLA.'
      : 'تابع التنفيذ وسجّل النتيجة عند الإغلاق.'
  };
  if (state === 'assigned') return {
    key:'assigned',
    label:'مسندة',
    overdue:false,
    escalated:false,
    overdueHours:0,
    dueHoursRemaining,
    riskKey:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 'high' : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 'medium' : 'low',
    riskLabel:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 'مخاطرة عالية' : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 'مخاطرة متوسطة' : 'مخاطرة منخفضة',
    riskScore:dueHoursRemaining !== null && dueHoursRemaining <= 4 ? 75 : dueHoursRemaining !== null && dueHoursRemaining <= 24 ? 50 : 20,
    nextAction:dueHoursRemaining !== null && dueHoursRemaining <= 4
      ? 'ابدأ التنفيذ الآن قبل اقتراب الـSLA.'
      : 'ابدأ التنفيذ وسجّل تقدم المهمة.'
  };
  return {
    key:'unassigned',
    label:'غير مسندة',
    overdue:false,
    escalated:false,
    overdueHours:0,
    dueHoursRemaining,
    riskKey:'high',
    riskLabel:'مخاطرة عالية',
    riskScore:70,
    nextAction:'عيّن مسؤولًا وحدد SLA واضحًا قبل ترك المهمة مفتوحة.'
  };
};

const outcomeLearningSignal = (learning, sourceType, sourceKey) => {
  const rows = Array.isArray(learning?.rows) ? learning.rows : [];
  const row = rows.find(item => item.sourceType === sourceType && item.sourceKey === sourceKey) || null;
  if (!row || Number(row.sampleSize || row.total || 0) < 3) return null;
  return {
    key: row.key,
    signalKey: row.signalKey || 'early',
    signalLabel: row.signalLabel || 'إشارة مبكرة',
    sampleSize: Number(row.sampleSize || row.total || 0),
    conversionRate: Number(row.conversionRate || 0),
    topReasonKey: clean(row.topReasonKey || 'unclassified', 40),
    topReason: clean(row.topReason || 'غير مصنف', 100),
    topReasonCount: Number(row.topReasonCount || 0),
    learningAction: clean(row.learningAction || '', 320),
    measuredRevenue: number(row.measuredRevenue)
  };
};

const outcomeLearningPolicy = (signal) => {
  if (!signal) return null;
  const frictionReasons = new Set(['customer_unresponsive','not_interested','not_relevant','operational_issue','timing','duplicate']);
  const sampleSize = Number(signal.sampleSize || 0);
  const reasonCount = Number(signal.topReasonCount || 0);
  const reasonShare = sampleSize ? reasonCount / sampleSize : 0;
  const avoidRepeat = sampleSize >= 3 && reasonCount >= 2 && reasonShare >= 0.5 && Number(signal.conversionRate || 0) < 50 && frictionReasons.has(signal.topReasonKey);
  if (!avoidRepeat) return {
    key:'continue_with_measurement',
    label:'يمكن الاستمرار مع القياس',
    avoidRepeat:false,
    reason: signal.topReason,
    sampleSize,
    conversionRate: Number(signal.conversionRate || 0),
    alternativeAction:'واصل القياس وسجّل النتيجة والسبب قبل تغيير المسار.'
  };
  const alternatives = {
    customer_unresponsive:'لا تكرر نفس محاولة التواصل؛ غيّر التوقيت أو قناة التواصل المعتمدة ثم اختبر النتيجة.',
    not_interested:'لا تكرر نفس العرض؛ غيّر القيمة المقترحة أو صياغة العرض ثم اختبر الاستجابة.',
    not_relevant:'لا تكرر نفس العرض لهذه الفرصة؛ غيّر المنتج أو الشريحة أو زاوية الاقتراح بما يتوافق مع السياق.',
    operational_issue:'لا تكرر التنفيذ قبل معالجة العائق التشغيلي المسجل وإثبات جاهزية المسار.',
    timing:'لا تكرر نفس التوقيت؛ انقل التنفيذ إلى نافذة أنسب وسجّل أثر التغيير.',
    duplicate:'لا تنشئ إجراءً مكررًا؛ راجع الإجراء أو الطلب السابق أولًا وتأكد أن الحاجة ما زالت قائمة.'
  };
  return {
    key:'change_strategy',
    label:'لا تكرر نفس الأسلوب',
    avoidRepeat:true,
    reason: signal.topReason,
    reasonCount,
    sampleSize,
    conversionRate: Number(signal.conversionRate || 0),
    alternativeAction: alternatives[signal.topReasonKey] || 'غيّر تفاصيل التنفيذ بعد مراجعة سبب النتيجة السابقة.'
  };
};

export function createRevenueService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  repository
}) {
  const { customers, reservations, orders, products } = repository;
  const stateQueries = {
    findCustomer: (predicate) => customers.find(predicate),
    findProduct: (predicate) => products.find(predicate),
    findReservation: (predicate) => reservations.find(predicate),
    filterOrders: (predicate) => orders.filter(predicate),
    filterReservations: (predicate) => reservations.filter(predicate)
  };
  const REVENUE_PERSIST_DEBOUNCE_MS = 250;
    const REVENUE_SUMMARY_CACHE_MS = 3000;
    const REVENUE_SEGMENTS_CACHE_MS = 5000;
    const events = [];
    const campaigns = [];
    let persistQueue = Promise.resolve();
    let persistTimer = null;
    let persistRequested = false;
    let summaryCache = null;
    let summaryCacheAt = 0;
    let segmentsCache = null;
    let segmentsCacheAt = 0;
    const invalidateRevenueCaches = () => {
      summaryCache = null;
      summaryCacheAt = 0;
      segmentsCache = null;
      segmentsCacheAt = 0;
    };
  
    async function restoreRevenue() {
      if (!storageReady) return;
      const result = await readJsonWithStatus(REVENUE_STATE_KEY);
      if (!result.ok) throw new Error('Revenue state could not be restored from storage.');
      const saved = result.value;
      if (saved && Array.isArray(saved.events)) events.splice(0, events.length, ...saved.events.slice(-MAX_EVENTS));
      if (saved && Array.isArray(saved.campaigns)) campaigns.splice(0, campaigns.length, ...saved.campaigns.slice(-MAX_CAMPAIGNS));
    }
  
    function flushPersistRevenue() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (!storageReady || !persistRequested) return persistQueue;
      persistRequested = false;
      const snapshot = { version: 2, events: events.slice(-MAX_EVENTS), campaigns: campaigns.slice(-MAX_CAMPAIGNS) };
      persistQueue = persistQueue.catch(() => {}).then(() => writeJson(REVENUE_STATE_KEY, snapshot));
      return persistQueue;
    }
  
    function persistRevenue() {
      if (!storageReady) return Promise.resolve(false);
      persistRequested = true;
      if (!persistTimer) {
        persistTimer = setTimeout(() => { void flushPersistRevenue(); }, REVENUE_PERSIST_DEBOUNCE_MS);
        persistTimer.unref();
      }
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
        cartItems: Array.isArray(input.cartItems)
          ? input.cartItems.slice(0, 30).map(item => ({
              productId: clean(item?.productId, 50),
              quantity: Math.max(1, Math.min(20, Math.round(number(item?.quantity, 1))))
            })).filter(item => item.productId)
          : [],
        metadata: input.metadata && typeof input.metadata === 'object'
          ? Object.fromEntries(Object.entries(input.metadata).slice(0, 12).map(([key, value]) => [clean(key, 60), clean(value, 180)]))
          : {},
        createdAt: new Date().toISOString()
      };
      events.push(row);
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
      invalidateRevenueCaches();
      void persistRevenue();
      return row;
    }
  
    function uniqueSessions(rows, eventName) {
      return new Set(rows.filter(row => row.eventName === eventName).map(row => row.sessionId || row.id)).size;
    }
  
    function buildSummary() {
      const now = Date.now();
      if (summaryCache && now - summaryCacheAt < REVENUE_SUMMARY_CACHE_MS) return summaryCache;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const recent = events.filter(row => {
        const time = Date.parse(row.createdAt || '');
        return Number.isFinite(time) && time >= thirtyDaysAgo;
      });
  
      const eventsBySession = new Map();
      const productViewSessions = new Map();
      const productAddSessions = new Map();
      for (const row of recent) {
        if (row.sessionId) {
          const sessionRows = eventsBySession.get(row.sessionId) || [];
          sessionRows.push(row);
          eventsBySession.set(row.sessionId, sessionRows);
        }
        if (row.productId && (row.eventName === 'item_view' || row.eventName === 'add_to_cart')) {
          const target = row.eventName === 'item_view' ? productViewSessions : productAddSessions;
          const sessions = target.get(row.productId) || new Set();
          sessions.add(row.sessionId || row.id);
          target.set(row.productId, sessions);
        }
      }
      for (const rows of eventsBySession.values()) {
        rows.sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));
      }
  
      const ordersByPhone = new Map();
      for (const order of orders.all()) {
        if (!order.phone || order.status !== 'completed') continue;
        const phoneOrders = ordersByPhone.get(order.phone) || [];
        phoneOrders.push(order);
        ordersByPhone.set(order.phone, phoneOrders);
      }
      for (const phoneOrders of ordersByPhone.values()) {
        phoneOrders.sort((a, b) => Date.parse(orderCompletionTimestamp(b)) - Date.parse(orderCompletionTimestamp(a)));
      }
  
      const completedSessions = new Set(
        recent
          .filter(row => row.eventName === 'order_completed')
          .map(row => row.sessionId || row.orderId || row.id)
      );
      for (const order of orders.all()) {
        if (order.status !== 'completed') continue;
        const completedAt = Date.parse(order.completedAt || order.createdAt || '');
        if (!Number.isFinite(completedAt) || completedAt < thirtyDaysAgo || completedAt > now) continue;
        completedSessions.add(order.sessionId || order.id);
      }
      const funnelSessionCount = eventName => eventName === 'order_completed'
        ? completedSessions.size
        : uniqueSessions(recent, eventName);
  
      const funnel = {
        menuViews: funnelSessionCount('menu_view'),
        itemViews: funnelSessionCount('item_view'),
        addToCart: funnelSessionCount('add_to_cart'),
        checkoutStarted: funnelSessionCount('checkout_started'),
        completedOrders: funnelSessionCount('order_completed')
      };
  
      const funnelPairs = [
        ['menu_view', 'item_view', 'المنيو → المنتج'],
        ['item_view', 'add_to_cart', 'المنتج → السلة'],
        ['add_to_cart', 'checkout_started', 'السلة → الدفع'],
        ['checkout_started', 'order_completed', 'الدفع → الطلب']
      ];
      const funnelRates = funnelPairs.map(([from,to,label]) => {
        const fromCount = funnelSessionCount(from);
        const toCount = funnelSessionCount(to);
        const rate = fromCount ? Math.round((Math.min(100, (toCount / fromCount) * 100)) * 10) / 10 : null;
        return { from, to, label, fromCount, toCount, rate, lossRate: rate === null ? null : Math.round((100 - rate) * 10) / 10 };
      });
      const measuredRates = funnelRates.filter(item => item.rate !== null);
      const healthScore = measuredRates.length ? Math.round(measuredRates.reduce((sum, item) => sum + item.rate, 0) / measuredRates.length) : 0;
      const biggestLeak = [...funnelRates].filter(item => item.lossRate !== null).sort((a,b) => b.lossRate - a.lossRate)[0] || null;
      const healthLabel = healthScore >= 70 ? 'قوي' : healthScore >= 40 ? 'متوسط' : measuredRates.length ? 'يحتاج متابعة' : 'بانتظار البيانات';
  
      const bySession = new Map();
      for (const row of recent) {
        if (!row.sessionId) continue;
        const current = bySession.get(row.sessionId) || {
          sessionId: row.sessionId,
          lastActivityAt: row.createdAt,
          cartValue: 0,
          productId: '',
          hasIntent: false,
          startedCheckout: false,
          completed: false,
          cartItems: [],
          cartCleared: false
        };
        if (Date.parse(row.createdAt) >= Date.parse(current.lastActivityAt)) current.lastActivityAt = row.createdAt;
        if (row.eventName === 'add_to_cart' || row.eventName === 'checkout_started') {
          current.hasIntent = true;
          current.cartValue = Math.max(current.cartValue, number(row.cartValue));
          current.productId = row.productId || current.productId;
        }
        if (row.eventName === 'checkout_started') current.startedCheckout = true;
        if (Array.isArray(row.cartItems)) {
          current.cartItems = row.cartItems;
          if (row.eventName === 'cart_updated') current.cartCleared = row.cartItems.length === 0;
        }
        if (row.eventName === 'order_completed') current.completed = true;
        bySession.set(row.sessionId, current);
      }
  
      for (const sessionId of completedSessions) {
        const session = bySession.get(sessionId);
        if (session) session.completed = true;
      }
  
      const abandoned = [...bySession.values()]
        .filter(item => item.hasIntent && !item.completed && !item.cartCleared)
        .filter(item => {
          const age = now - Date.parse(item.lastActivityAt || '');
          return Number.isFinite(age) && age >= 30 * 60 * 1000 && age <= 72 * 60 * 60 * 1000;
        })
        .map(item => {
          const minutes = ageMinutes(now, item.lastActivityAt);
          const recencyPoints = minutes <= 180 ? 30 : minutes <= 720 ? 22 : minutes <= 1440 ? 14 : 6;
          const cartPoints = Math.min(35, Math.round(number(item.cartValue) / 10));
          const checkoutPoints = item.startedCheckout ? 25 : 12;
          const score = clamp(18 + recencyPoints + cartPoints + checkoutPoints);
          const p = priority(score);
          return {
            ...item,
            cartItems: Array.isArray(item.cartItems) ? item.cartItems : [],
            priorityScore: score,
            priority: p.label,
            priorityKey: p.key,
            reason: item.startedCheckout
              ? `بدأ الدفع ولم يكمل الطلب منذ ${ageLabel(minutes)}.`
              : `أضاف منتجات للسلة ولم يكمل الطلب منذ ${ageLabel(minutes)}.`,
            recommendedAction: 'راجع سبب التوقف، ثم فعّل استرجاع السلة لاحقًا بعد وجود موافقة تواصل مناسبة.',
            potentialValue: Math.round(number(item.cartValue) * 100) / 100
          };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore || number(b.cartValue) - number(a.cartValue))
        .slice(0, 50);
  
      const inactiveCustomers = customers.all()
        .map(customer => {
          const completedOrders = ordersByPhone.get(customer.phone) || [];
          if (completedOrders.length < 2) return null;
          const lastOrder = completedOrders[0] || null;
          const lastOrderAt = orderCompletionTimestamp(lastOrder);
          const daysSinceLastOrder = Math.floor((now - Date.parse(lastOrderAt)) / 86400000);
          const cartItems = Array.isArray(lastOrder?.items)
            ? lastOrder.items.map(item => ({
                productId: clean(item.productId, 50),
                quantity: Math.max(1, Math.min(20, Math.round(number(item.quantity, 1))))
              })).filter(item => item.productId)
            : [];
          return { ...customer, orderCount: completedOrders.length, lastOrderAt, daysSinceLastOrder, lastOrder, cartItems };
        })
        .filter(customer => customer && Number.isFinite(customer.daysSinceLastOrder) && customer.daysSinceLastOrder >= 21 && customer.cartItems.length > 0)
        .map(customer => {
          const score = clamp(25 + Math.min(35, Math.floor(customer.daysSinceLastOrder / 2)) + Math.min(35, customer.orderCount * 5));
          const p = priority(score);
          return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            orderCount: customer.orderCount,
            lastOrderAt: customer.lastOrderAt,
            daysSinceLastOrder: customer.daysSinceLastOrder,
            lastOrderValue: Math.max(0, number(customer.lastOrder?.total)),
            cartItems: customer.cartItems,
            priorityScore: score,
            priority: p.label,
            priorityKey: p.key,
            reason: `عميل متكرر لديه ${customer.orderCount} طلبات سابقة، وآخر طلب منذ ${customer.daysSinceLastOrder} يوم.`,
            recommendedAction: 'جهّز رابط إعادة الطلب من آخر مشتريات العميل، ثم شاركه يدويًا بعد التحقق من موافقة التواصل.',
            potentialValue: Math.max(0, number(customer.lastOrder?.total))
          };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore || b.daysSinceLastOrder - a.daysSinceLastOrder)
        .slice(0, 50);
  
      const productInterest = [...new Set(recent.map(row => row.productId).filter(Boolean))]
        .map(productId => {
          const views = productViewSessions.get(productId)?.size || 0;
          const adds = productAddSessions.get(productId)?.size || 0;
          if (views < 5) return null;
          const addRate = views ? Math.round((adds / views) * 1000) / 10 : 0;
          if (addRate >= 35) return null;
          const gapRate = Math.max(0, 100 - addRate);
          const score = clamp(40 + Math.min(35, Math.round(gapRate * 0.35)) + Math.min(25, Math.round(views / 2)));
          const p = priority(score);
          const product = stateQueries.findProduct(item => item.id === productId) || {};
          return {
            productId,
            name: clean(product.nameAr || product.nameEn || productId, 100),
            views,
            adds,
            addRate,
            priorityScore: score,
            priority: p.label,
            priorityKey: p.key,
            reason: 'المنتج شوهد ' + views + ' مرة في جلسات مختلفة، لكن الإضافة للسلة حدثت في ' + adds + ' جلسات فقط.',
            recommendedAction: 'راجع السعر والصورة والوصف وطريقة تقديم المنتج، ثم قِس التفاعل مرة أخرى.',
            potentialValue: 0
          };
        })
        .filter(Boolean)
        .sort((a,b) => b.priorityScore - a.priorityScore || b.views - a.views)
        .slice(0, 50);
  
      const returnCustomers = customers.all()
        .map(customer => {
          const customerOrders = [...(ordersByPhone.get(customer.phone) || [])].sort(
            (a,b) => Date.parse(a.updatedAt || a.createdAt || '') - Date.parse(b.updatedAt || b.createdAt || '')
          );
          if (customerOrders.length < 3) return null;
          const orderTimes = customerOrders
            .map(order => Date.parse(orderCompletionTimestamp(order)))
            .filter(time => Number.isFinite(time));
          if (orderTimes.length < 3) return null;
          const gaps = [];
          for (let index = 1; index < orderTimes.length; index += 1) {
            const gapDays = (orderTimes[index] - orderTimes[index - 1]) / 86400000;
            if (gapDays >= 7 && gapDays <= 60) gaps.push(gapDays);
          }
          if (gaps.length < 2) return null;
          const averageGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
          const lastOrder = customerOrders[customerOrders.length - 1];
          const lastOrderAt = Date.parse(orderCompletionTimestamp(lastOrder));
          const daysSinceLastOrder = Math.floor((now - lastOrderAt) / 86400000);
          if (daysSinceLastOrder < Math.max(5, Math.floor(averageGap * 0.8)) || daysSinceLastOrder > Math.ceil(averageGap * 1.5)) return null;
          const cartItems = Array.isArray(lastOrder.items)
            ? lastOrder.items.map(item => ({
                productId: clean(item.productId, 50),
                quantity: Math.max(1, Math.min(20, Math.round(number(item.quantity, 1))))
              })).filter(item => item.productId)
            : [];
          if (!cartItems.length) return null;
          const progress = Math.max(0, Math.min(1, daysSinceLastOrder / averageGap));
          const score = clamp(45 + Math.round(progress * 35) + Math.min(20, gaps.length * 3));
          const p = priority(score);
          return {
            id: customer.id,
            name: clean(customer.name || 'عميل', 80),
            phone: clean(customer.phone, 40),
            orderCount: customerOrders.length,
            averageGapDays: Math.round(averageGap * 10) / 10,
            daysSinceLastOrder,
            lastOrderValue: Math.max(0, number(lastOrder.total)),
            cartItems,
            priorityScore: score,
            priority: p.label,
            priorityKey: p.key,
            reason: 'نمط الطلبات يشير إلى عودة كل ' + Math.round(averageGap) + ' يوم تقريبًا، ومرّ ' + daysSinceLastOrder + ' يومًا منذ آخر طلب.',
            recommendedAction: 'جهّز رابط إعادة الطلب من آخر مشتريات العميل الآن، ثم شاركه يدويًا بعد التحقق من موافقة التواصل.',
            potentialValue: Math.max(0, number(lastOrder.total))
          };
        })
        .filter(Boolean)
        .sort((a,b) => b.priorityScore - a.priorityScore || b.daysSinceLastOrder - a.daysSinceLastOrder)
        .slice(0, 50);
  
      const upcomingReservations = stateQueries.filterReservations(reservation => reservation.status !== 'cancelled')
        .map(reservation => {
          const at = Date.parse(`${reservation.date}T${reservation.time}:00`);
          return { ...reservation, at };
        })
        .filter(reservation => Number.isFinite(reservation.at) && reservation.at > now && reservation.at <= now + 48 * 60 * 60 * 1000)
        .map(reservation => {
          const hours = Math.max(0, Math.floor((reservation.at - now) / 3600000));
          const urgencyPoints = hours <= 6 ? 60 : hours <= 24 ? 45 : 30;
          const guestPoints = Math.min(35, number(reservation.guests) * 5);
          const score = clamp(urgencyPoints + guestPoints);
          const p = priority(score);
          return {
            ...reservation,
            priorityScore: score,
            priority: p.label,
            priorityKey: p.key,
            reason: `حجز قريب لـ${number(reservation.guests)} أشخاص.`,
            recommendedAction: 'جهّز اقتراح Pre-order مناسب قبل الزيارة، مع الالتزام بالموافقة المطلوبة للتواصل.'
          };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore || a.at - b.at)
        .slice(0, 50);
  
      const identifiedCustomers = new Set(recent.filter(row => row.customerId).map(row => row.customerId)).size;
      const identifiedEvents = recent.filter(row => row.customerId).length;
      const intentSessions = [...bySession.keys()].length;
      const intentConversions = [];
      for (const [sessionId] of bySession) {
        const rows = eventsBySession.get(sessionId) || [];
        let intent = null;
        for (const row of rows) {
          if (row.eventName === 'add_to_cart' || row.eventName === 'checkout_started') {
            intent = { at: row.createdAt, value: Math.max(number(row.cartValue), number(intent?.value)) };
          }
          if (row.eventName === 'order_completed' && intent) {
            const gap = Date.parse(row.createdAt) - Date.parse(intent.at);
            if (Number.isFinite(gap) && gap >= 60 * 1000 && gap <= 72 * 60 * 60 * 1000) {
              intentConversions.push({
                sessionId,
                orderId: row.orderId,
                orderValue: number(row.orderValue),
                minutesToOrder: Math.floor(gap / 60000)
              });
              break;
            }
          }
        }
      }
      const intentConversionRate = intentSessions ? Math.round((intentConversions.length / intentSessions) * 1000) / 10 : 0;
      const attributedIntentRevenue = Math.round(intentConversions.reduce((sum, row) => sum + number(row.orderValue), 0) * 100) / 100;
  
      const topActions = [
        ...abandoned.map(item => ({
          type: 'abandoned_cart', priorityScore: item.priorityScore, priority: item.priority, priorityKey: item.priorityKey,
          title: `سلة متروكة بقيمة ${Math.round(number(item.cartValue))} AED`, reason: item.reason,
          recommendedAction: item.recommendedAction, potentialValue: item.potentialValue, reference: item.sessionId
        })),
        ...productInterest.map(item => ({
          type: 'product_interest', priorityScore: item.priorityScore, priority: item.priority, priorityKey: item.priorityKey,
          title: 'اهتمام غير مكتمل: ' + clean(item.name || item.productId, 70), reason: item.reason,
          recommendedAction: item.recommendedAction, potentialValue: item.potentialValue, reference: item.productId
        })),
        ...returnCustomers.map(item => ({
          type: 'returning_customer', priorityScore: item.priorityScore, priority: item.priority, priorityKey: item.priorityKey,
          title: `موعد عودة قريب: ${clean(item.name || 'عميل', 70)}`, reason: item.reason,
          recommendedAction: item.recommendedAction, potentialValue: item.potentialValue, cartItems: item.cartItems, reference: item.id
        })),
        ...inactiveCustomers.map(item => ({
          type: 'inactive_customer', priorityScore: item.priorityScore, priority: item.priority, priorityKey: item.priorityKey,
          title: `إعادة تنشيط: ${clean(item.name || 'عميل', 70)}`, reason: item.reason,
          recommendedAction: item.recommendedAction, potentialValue: item.potentialValue, cartItems: item.cartItems, reference: item.id
        })),
        ...upcomingReservations.map(item => ({
          type: 'upcoming_reservation', priorityScore: item.priorityScore, priority: item.priority, priorityKey: item.priorityKey,
          title: `حجز قريب: ${clean(item.name || 'عميل', 70)}`, reason: item.reason,
          recommendedAction: item.recommendedAction, potentialValue: 0, reference: item.id
        }))
      ].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 12);
      const rankedTopActions = topActions;
  
      const segmentPerformance = customerSegments().map(segment => {
        const metrics = segment.actionMetrics || {};
        return {
          key: segment.key,
          label: segment.label,
          audience: segment.count,
          executed: metrics.executed,
          converted: metrics.converted,
          attributedOrders: metrics.attributedOrders,
          measuredRevenue: metrics.measuredRevenue,
          conversionRate: metrics.executed ? Math.round((metrics.converted / metrics.executed) * 1000) / 10 : 0
        };
      });
      const measuredActions = campaigns
        .filter(item => item.status === 'converted' && number(item.resultRevenue) > 0)
        .sort((a,b) => number(b.resultRevenue) - number(a.resultRevenue))
        .slice(0, 10)
        .map(item => ({
          id: item.id,
          title: item.title,
          type: item.type,
          reference: item.reference,
          revenue: number(item.resultRevenue),
          orderId: item.orderId || '',
          matchedOrder: Boolean(item.attribution?.matchedOrder),
          customerId: item.customerId || '',
          updatedAt: item.updatedAt
        }));
      const completedOrderEvents = events
        .filter(item => item.eventName === 'order_completed' && number(item.orderValue) > 0)
        .map(item => ({ time: Date.parse(item.createdAt || ''), value: number(item.orderValue) }))
        .filter(item => Number.isFinite(item.time))
        .sort((a,b) => a.time - b.time);
      const dayMs = 24 * 60 * 60 * 1000;
      const recent14 = completedOrderEvents.filter(item => item.time >= now - 14 * dayMs);
      const recent30 = completedOrderEvents.filter(item => item.time >= now - 30 * dayMs);
      const previous16 = completedOrderEvents.filter(item => item.time >= now - 30 * dayMs && item.time < now - 14 * dayMs);
      const revenue14 = recent14.reduce((sum, item) => sum + item.value, 0);
      const revenue30 = recent30.reduce((sum, item) => sum + item.value, 0);
      const previous16Revenue = previous16.reduce((sum, item) => sum + item.value, 0);
      const daily14 = revenue14 / 14;
      const daily30 = revenue30 / 30;
      const dailyPrevious16 = previous16Revenue / 16;
      const blendedDailyRunRate = (daily14 * 0.6) + (daily30 * 0.4);
      const trendRate = dailyPrevious16 > 0
        ? Math.round(((daily14 - dailyPrevious16) / dailyPrevious16) * 1000) / 10
        : null;
      const forecast = {
        basis: 'completed_order_events',
        methodology: 'تقدير تشغيلي مبني على 60% من متوسط الإيراد اليومي لآخر 14 يومًا و40% من متوسط آخر 30 يومًا.',
        actual: {
          revenue14: Math.round(revenue14 * 100) / 100,
          revenue30: Math.round(revenue30 * 100) / 100,
          orders14: recent14.length,
          orders30: recent30.length
        },
        runRate: {
          daily14: Math.round(daily14 * 100) / 100,
          daily30: Math.round(daily30 * 100) / 100,
          blendedDaily: Math.round(blendedDailyRunRate * 100) / 100
        },
        next7Days: Math.round(blendedDailyRunRate * 7 * 100) / 100,
        next30Days: Math.round(blendedDailyRunRate * 30 * 100) / 100,
        trendRate,
        trendLabel: trendRate === null ? 'لا توجد مقارنة كافية' : trendRate > 5 ? 'صاعد' : trendRate < -5 ? 'هابط' : 'مستقر',
        openOpportunityValue: Math.round(abandoned.reduce((sum, item) => sum + number(item.cartValue), 0) * 100) / 100,
        note: 'هذا تقدير تشغيلي من البيانات المسجلة، وليس ضمانًا للإيراد المستقبلي. قيمة الفرص المفتوحة معروضة منفصلة ولا تدخل التوقع الأساسي.'
      };
  
      const totalMeasuredRevenue = campaigns.reduce((sum, item) => sum + number(item.resultRevenue), 0);
      const bestMeasuredSegment = [...segmentPerformance].sort((a,b) => b.measuredRevenue - a.measuredRevenue)[0] || null;
      const alerts = [];
      if (biggestLeak && biggestLeak.lossRate >= 70) {
        alerts.push({
          severity:'high',
          key:'funnel_leak',
          title:'تسريب كبير في مسار الطلب',
          detail:`${biggestLeak.label} لديه ${Number(biggestLeak.lossRate).toFixed(1)}% فقد.`,
          action:'راجع هذه المرحلة أولًا قبل زيادة الإنفاق أو توسيع الحملات.'
        });
      }
      if (forecast.trendRate !== null && forecast.trendRate <= -10) {
        alerts.push({
          severity:'high',
          key:'revenue_downtrend',
          title:'اتجاه الإيراد هابط',
          detail:`متوسط الإيراد اليومي لآخر 14 يومًا أقل من فترة المقارنة بنسبة ${Math.abs(Number(forecast.trendRate)).toFixed(1)}%.`,
          action:'راجع مصادر الطلب والإجراءات المقاسة قبل توسيع النشاط.'
        });
      } else if (forecast.trendRate !== null && forecast.trendRate >= 10) {
        alerts.push({
          severity:'medium',
          key:'revenue_uptrend',
          title:'اتجاه الإيراد صاعد',
          detail:`متوسط الإيراد اليومي لآخر 14 يومًا أعلى من فترة المقارنة بنسبة ${Number(forecast.trendRate).toFixed(1)}%.`,
          action:'راجع ما حدث في هذه الفترة وسجّل الإجراءات المرتبطة قبل تكرارها.'
        });
      }
      const overdueTaskRows = campaigns
        .filter(item => item.status === 'draft')
        .map(item => ({ campaign:item, task:taskWorkflow(item, now) }))
        .filter(item => item.task.overdue);
  
      const blockedTaskRows = campaigns
        .filter(item => item.status === 'draft')
        .map(item => ({ campaign:item, task:taskWorkflow(item, now) }))
        .filter(item => item.task.key === 'blocked');
      if (blockedTaskRows.length > 0) {
        alerts.push({
          severity:'high',
          key:'blocked_revenue_tasks',
          title:'مهام إيرادات محجوبة',
          detail: blockedTaskRows.length + ' مهمة متوقفة بسبب عائق تشغيلي مسجل.',
          action:'راجع سبب العائق، عالجه، ثم أعد المهمة إلى مسار التنفيذ.'
        });
      }
  
      if (overdueTaskRows.length > 0) {
        const escalatedCount = overdueTaskRows.filter(item => item.task.escalated).length;
        alerts.push({
          severity: escalatedCount > 0 ? 'high' : 'medium',
          key:'overdue_revenue_tasks',
          title: escalatedCount > 0 ? 'تصعيد مهام إيرادات مطلوب' : 'مهام إيرادات متأخرة',
          detail: escalatedCount > 0
            ? escalatedCount + ' مهمة تجاوزت الـSLA بأكثر من 24 ساعة، من إجمالي ' + overdueTaskRows.length + ' مهام متأخرة.'
            : overdueTaskRows.length + ' مهمة تجاوزت موعد الـSLA ولم تُغلق بعد.',
          action: 'راجِع المسؤول والموعد فورًا، ثم حدّث حالة المهمة أو سجّل النتيجة التشغيلية.'
        });
      }
  
      if (abandoned.length > 0) {
        alerts.push({
          severity:'medium',
          key:'abandoned_carts',
          title:'فرص سلال متروكة متاحة',
          detail:`${abandoned.length} سلة مؤهلة بقيمة محتملة إجمالية ${Math.round(abandoned.reduce((sum,item)=>sum+number(item.cartValue),0))} AED.`,
          action:'ابدأ بالأعلى أولوية، ثم استخدم مسودة الإجراء بعد التحقق من الموافقة.'
        });
      }
      if (inactiveCustomers.length > 0) {
        alerts.push({
          severity:'medium',
          key:'lapsed_customers',
          title:'عملاء متكررون غير نشطين',
          detail:`${inactiveCustomers.length} عميل يحتاج مراجعة لإعادة التنشيط.`,
          action:'افتح الشرائح وراجع تاريخ العميل قبل أي تواصل.'
        });
      }
      if (upcomingReservations.length > 0) {
        alerts.push({
          severity:'low',
          key:'upcoming_reservations',
          title:'حجوزات قريبة',
          detail:`${upcomingReservations.length} حجز خلال 48 ساعة يمكن الاستعداد له.`,
          action:'جهّز عروض Pre-order أو إضافات مناسبة قبل الزيارة.'
        });
      }
      const alertsSummary = {
        count: alerts.length,
        high: alerts.filter(item=>item.severity==='high').length,
        medium: alerts.filter(item=>item.severity==='medium').length,
        low: alerts.filter(item=>item.severity==='low').length,
        items: alerts
      };
  
      const intelligence = {
        nextActions: rankedTopActions.slice(0, 5),
        segmentPerformance,
        measuredActions,
        totals: {
          potentialAbandonedRevenue: abandoned.reduce((sum, item) => sum + number(item.cartValue), 0),
          measuredRevenue: Math.round(totalMeasuredRevenue * 100) / 100,
          attributedOrders: campaigns.filter(item => item.status === 'converted' && item.attribution?.matchedOrder).length,
          convertedActions: campaigns.filter(item => item.status === 'converted').length
        },
        bestMeasuredSegment
      };
  
      const campaignSummaryResult = campaignSummary();
      const result = {
        generatedAt: new Date().toISOString(),
        windowDays: 30,
        funnel,
        opportunities: { abandonedCarts: abandoned, inactiveCustomers, returnCustomers, productInterest, upcomingReservations },
        topActions: rankedTopActions,
        counts: {
          abandonedCarts: abandoned.length, inactiveCustomers: inactiveCustomers.length, returnCustomers: returnCustomers.length, productInterest: productInterest.length,
          upcomingReservations: upcomingReservations.length, topActions: topActions.length
        },
        potentialAbandonedRevenue: abandoned.reduce((sum, item) => sum + number(item.cartValue), 0),
        campaigns: campaignSummaryResult,
        valueRealization: campaignSummaryResult.valueRealization,
        health: { score: healthScore, label: healthLabel, biggestLeak, funnelRates },
        identity: { identifiedCustomers, identifiedEvents, coverageRate: recent.length ? Math.round((identifiedEvents / recent.length) * 1000) / 10 : 0 },
  
        intelligence,
        forecast,
        alerts: alertsSummary,
        measurement: {
          intentSessions,
          intentConversions: intentConversions.length,
          intentConversionRate,
          attributedIntentRevenue,
          attributionNote: 'الإيراد مرتبط بطلب حدث بعد نية شراء داخل الجلسة، وليس إثباتًا سببيًا بأن الفرصة أنشأت الطلب.'
        }
      };
      summaryCache = result;
      summaryCacheAt = now;
      return result;
    }
  
    function appendCampaignActivity(campaign, type, details = {}, actor = 'لوحة الإيرادات') {
      if (!Array.isArray(campaign.activityLog)) campaign.activityLog = [];
      campaign.activityLog.push({
        id: crypto.randomUUID(),
        type: clean(type, 40),
        actor: clean(actor, 80) || 'لوحة الإيرادات',
        details: Object.fromEntries(Object.entries(details || {}).slice(0, 10).map(([key, value]) => [clean(key, 40), clean(value, 180)])),
        createdAt: new Date().toISOString()
      });
      if (campaign.activityLog.length > 50) campaign.activityLog.splice(0, campaign.activityLog.length - 50);
    }
  
    function createCampaignDraft(input = {}) {
      const type = clean(input.type, 40);
      const reference = clean(input.reference, 120);
      const summary = buildSummary();
      const segment = type === 'segment_action' ? customerSegments().find(item => item.key === reference) : null;
      const alert = type === 'alert_action' ? (summary.alerts?.items || []).find(item => item.key === reference) : null;
      const action = segment ? {
        title: segment.label,
        reason: segment.description,
        recommendedAction: segment.recommendedAction,
        potentialValue: 0
      } : alert ? {
        title: alert.title,
        reason: alert.detail,
        recommendedAction: alert.action,
        potentialValue: 0
      } : (summary.topActions || []).find(item => item.type === type && item.reference === reference);
      if (!action) return null;
      const sourceType = alert ? 'revenue_alert' : segment ? 'customer_segment' : 'revenue_opportunity';
      const sourceKey = alert?.key || segment?.key || type;
      const learningSignal = outcomeLearningSignal(summary.outcomeLearning, sourceType, sourceKey);
      const learningPolicy = outcomeLearningPolicy(learningSignal);
  
      let customerId = '';
      let customerName = '';
      let customerPhone = '';
      if (['inactive_customer','returning_customer'].includes(type)) {
        const customer = stateQueries.findCustomer(item => item.id === reference);
        if (customer) {
          customerId = clean(customer.id, 100);
          customerName = clean(customer.name || 'عميل', 80);
          customerPhone = clean(customer.phone, 40);
        }
      } else if (type === 'upcoming_reservation') {
        const reservation = stateQueries.findReservation(item => item.id === reference);
        if (reservation) {
          const customer = stateQueries.findCustomer(item => item.phone && reservation.phone && item.phone === reservation.phone);
          customerId = clean(customer?.id || '', 100);
          customerName = clean(customer?.name || reservation.name || 'عميل', 80);
          customerPhone = clean(customer?.phone || reservation.phone || '', 40);
        }
      }
  
      const existing = campaigns.find(item =>
        item.status === 'draft' &&
        item.type === type &&
        item.reference === reference &&
        (!['abandoned_cart', 'inactive_customer', 'returning_customer'].includes(type) || !item.recoveryExpiresAt || Date.parse(item.recoveryExpiresAt || '') > Date.now())
      );
      if (existing) return { ...existing, reused: true };
  
      const draft = {
        id: `C${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
        type,
        reference,
        title: action.title,
        message: type === 'alert_action'
          ? clean(action.recommendedAction, 500)
          : type === 'segment_action'
            ? clean(action.recommendedAction, 500)
            : type === 'abandoned_cart'
            ? 'مسودة استرجاع سلة: شارك رابط استرجاع السلة يدويًا بعد التحقق من الموافقة.'
            : type === 'inactive_customer'
              ? 'مسودة إعادة تنشيط: شارك رابط إعادة الطلب من آخر مشتريات العميل يدويًا بعد التحقق من الموافقة.'
              : type === 'returning_customer'
                ? 'مسودة عودة العميل: شارك رابط إعادة الطلب من آخر مشترياته يدويًا بعد التحقق من موافقة التواصل.'
                : type === 'product_interest'
                  ? clean(action.recommendedAction, 500)
                  : `مسودة اقتراح Pre-order للحجز: ${clean(action.title.replace('حجز قريب: ', ''), 70)}.`,
        status: 'draft',
        learningGuidance: learningPolicy?.avoidRepeat ? learningPolicy.alternativeAction : (learningSignal?.learningAction || ''),
        learningPolicy,
        consentRequired: true,
        sendable: false,
        executionNote: 'V1 لا يرسل الرسائل تلقائيًا. يجب تنفيذ التواصل خارج النظام فقط بعد التحقق من موافقة العميل.',
        potentialValue: number(action.potentialValue),
        cartItems: ['abandoned_cart', 'inactive_customer', 'returning_customer'].includes(type) && Array.isArray(action.cartItems)
          ? action.cartItems.slice(0, 30).map(item => ({
              productId: clean(item?.productId, 50),
              quantity: Math.max(1, Math.min(20, Math.round(number(item?.quantity, 1))))
            })).filter(item => item.productId)
          : [],
        recoveryToken: ['abandoned_cart', 'inactive_customer', 'returning_customer'].includes(type) ? crypto.randomBytes(18).toString('hex') : '',
        recoveryExpiresAt: type === 'abandoned_cart'
          ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          : ['inactive_customer', 'returning_customer'].includes(type)
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            : '',
        recoveryPath: '',
        audienceCount: segment ? Number(segment.count || 0) : 0,
        historicalSegmentRevenue: segment ? number(segment.totalRevenue) : 0,
        sourceType,
        sourceKey,
        learningSignal: learningSignal ? {
          signalKey: learningSignal.signalKey,
          signalLabel: learningSignal.signalLabel,
          sampleSize: learningSignal.sampleSize,
          conversionRate: learningSignal.conversionRate,
          topReasonKey: learningSignal.topReasonKey,
          topReason: learningSignal.topReason,
          measuredRevenue: learningSignal.measuredRevenue,
          learningAction: learningSignal.learningAction,
          applied: true
        } : null,
        alertSeverity: alert?.severity || '',
        customerId,
        customerName,
        customerPhone,
        owner: '',
        dueAt: '',
        workflowStatus: 'unassigned',
        assignedAt: '',
        startedAt: '',
        completedAt: '',
        taskNotes: '',
        blockerReason: '',
        blockerType: 'other',
        blockedAt: '',
        resolvedAt: '',
        blockerHistory: [],
        activityLog: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (draft.recoveryToken) draft.recoveryPath = '/cart?recover=' + encodeURIComponent(draft.recoveryToken);
      appendCampaignActivity(draft, 'created', { title: draft.title, sourceType: draft.sourceType, sourceKey: draft.sourceKey, learningPolicy: learningPolicy?.key || 'none', alternativeAction: learningPolicy?.avoidRepeat ? learningPolicy.alternativeAction : '' });
      campaigns.push(draft);
      if (campaigns.length > MAX_CAMPAIGNS) campaigns.splice(0, campaigns.length - MAX_CAMPAIGNS);
      invalidateRevenueCaches();
      void persistRevenue();
      return draft;
    }
  
    function executeReturningCustomerRecovery(reference) {
      const cleanReference = clean(reference, 120);
      const summary = buildSummary();
      const opportunity = (summary.opportunities?.returnCustomers || []).find(item => item.id === cleanReference);
      if (!opportunity) return null;
      if (!opportunity.cartItems?.length) return { error: 'CART_SNAPSHOT_UNAVAILABLE' };
      const existing = campaigns.find(item =>
        item.status === 'draft' &&
        item.type === 'returning_customer' &&
        item.reference === cleanReference &&
        item.recoveryToken &&
        Date.parse(item.recoveryExpiresAt || '') > Date.now()
      );
      if (existing) return { campaign: existing, reused: true };
      const draft = createCampaignDraft({ type: 'returning_customer', reference: cleanReference });
      return draft ? { campaign: draft, reused: false } : null;
    }
  
    function executeInactiveCustomerRecovery(reference) {
      const cleanReference = clean(reference, 120);
      const summary = buildSummary();
      const opportunity = (summary.opportunities?.inactiveCustomers || []).find(item => item.id === cleanReference);
      if (!opportunity) return null;
      if (!opportunity.cartItems?.length) return { error: 'CART_SNAPSHOT_UNAVAILABLE' };
      const existing = campaigns.find(item =>
        item.status === 'draft' &&
        item.type === 'inactive_customer' &&
        item.reference === cleanReference &&
        item.recoveryToken &&
        Date.parse(item.recoveryExpiresAt || '') > Date.now()
      );
      if (existing) return { campaign: existing, reused: true };
      const draft = createCampaignDraft({ type: 'inactive_customer', reference: cleanReference });
      return draft ? { campaign: draft, reused: false } : null;
    }
  
    function executeAbandonedCartRecovery(reference) {
      const cleanReference = clean(reference, 120);
      const summary = buildSummary();
      const opportunity = (summary.opportunities?.abandonedCarts || []).find(item => item.sessionId === cleanReference);
      if (!opportunity) return null;
      if (!opportunity.cartItems?.length) return { error: 'CART_SNAPSHOT_UNAVAILABLE' };
      const existing = campaigns.find(item =>
        item.status === 'draft' &&
        item.type === 'abandoned_cart' &&
        item.reference === cleanReference &&
        item.recoveryToken &&
        Date.parse(item.recoveryExpiresAt || '') > Date.now()
      );
      if (existing) return { campaign: existing, reused: true };
      const draft = createCampaignDraft({ type: 'abandoned_cart', reference: cleanReference });
      return draft ? { campaign: draft, reused: false } : null;
    }
  
    function getRecoveryCart(token) {
      const cleanToken = clean(token, 80);
      const campaign = campaigns.find(item => ['abandoned_cart', 'inactive_customer', 'returning_customer'].includes(item.type) && item.recoveryToken === cleanToken);
      if (!campaign) return { error: 'NOT_FOUND' };
      if (campaign.status === 'converted') return { error: 'ALREADY_RECOVERED' };
      const expiresAt = Date.parse(campaign.recoveryExpiresAt || '');
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { error: 'EXPIRED' };
      const items = (campaign.cartItems || []).map(item => {
        const product = stateQueries.findProduct(row => row.id === item.productId && row.available !== false);
        return product ? { id: product.id, qty: Number(item.quantity) || 1 } : null;
      }).filter(Boolean);
      if (!items.length) return { error: 'ITEMS_UNAVAILABLE' };
      return { title: campaign.title, items, expiresAt: campaign.recoveryExpiresAt, opportunityId: campaign.id };
    }
  
    function recordRecoveryOrder(token, orderId) {
      const cleanToken = clean(token, 80);
      const campaign = campaigns.find(item =>
        ['abandoned_cart', 'inactive_customer', 'returning_customer'].includes(item.type) &&
        item.recoveryToken === cleanToken &&
        item.status === 'draft'
      );
      if (!campaign) return null;
      return updateCampaignOutcome(campaign.id, {
        outcome: 'converted',
        orderId: clean(orderId, 30),
        outcomeReason: 'converted_to_order'
      });
    }
  
    function updateCampaignOutcome(id, input = {}) {
      const campaign = campaigns.find(item => item.id === clean(id, 40));
      if (!campaign) return null;
      const outcome = clean(input.outcome, 30);
      if (!new Set(['executed', 'converted', 'ignored']).has(outcome)) return null;
      const orderId = clean(input.orderId, 30);
      const linkedOrder = orderId ? orders.findById(orderId) : null;
      const manualRevenue = Math.max(0, number(input.revenue));
      const actor = clean(input.actor, 80);
      const requestedReason = clean(input.outcomeReason, 40);
      const validReason = Object.prototype.hasOwnProperty.call(OUTCOME_REASON_DEFINITIONS, requestedReason);
      const outcomeReason = validReason
        ? requestedReason
        : outcome === 'converted'
          ? (linkedOrder ? 'converted_to_order' : 'manual_conversion')
          : outcome === 'executed'
            ? 'completed_no_conversion'
            : 'unclassified';
      const outcomeReasonNote = clean(input.outcomeReasonNote, 240);
  
      campaign.status = outcome;
      campaign.workflowStatus = 'done';
      campaign.completedAt = new Date().toISOString();
      campaign.orderId = orderId;
      campaign.customerId = linkedOrder?.phone ? (stateQueries.findCustomer(customer => customer.phone === linkedOrder.phone)?.id || '') : '';
      campaign.resultRevenue = outcome === 'converted' && linkedOrder
        ? Math.max(0, number(linkedOrder.total))
        : manualRevenue;
      campaign.outcomeReason = outcomeReason;
      campaign.outcomeReasonLabel = outcomeReasonLabel(outcomeReason);
      campaign.outcomeReasonNote = outcomeReasonNote;
      campaign.attribution = outcome === 'converted'
        ? {
            source: linkedOrder ? 'order_lookup' : 'manual',
            orderId,
            customerId: campaign.customerId,
            orderValue: campaign.resultRevenue,
            matchedOrder: Boolean(linkedOrder)
          }
        : null;
      campaign.updatedAt = new Date().toISOString();
      appendCampaignActivity(campaign, 'outcome_recorded', {
        outcome,
        reason: outcomeReasonLabel(outcomeReason),
        reasonKey: outcomeReason,
        reasonNote: outcomeReasonNote,
        revenue: campaign.resultRevenue,
        orderId,
        matchedOrder: campaign.attribution?.matchedOrder ? 'yes' : 'no'
      }, actor);
      invalidateRevenueCaches();
      void persistRevenue();
      return campaign;
    }
    function updateCampaignTask(id, input = {}) {
      const campaign = campaigns.find(item => item.id === clean(id, 40));
      if (!campaign || campaign.status !== 'draft') return null;
      const requestedStatus = clean(input.workflowStatus, 30);
      if (!new Set(['unassigned', 'assigned', 'in_progress', 'blocked']).has(requestedStatus)) return null;
      const owner = clean(input.owner, 80);
      const dueAt = clean(input.dueAt, 40);
      const blockerReason = clean(input.blockerReason, 240);
      const blockerType = Object.prototype.hasOwnProperty.call(BLOCKER_TYPE_DEFINITIONS, clean(input.blockerType, 40))
        ? clean(input.blockerType, 40)
        : 'other';
      const actor = clean(input.actor, 80);
      if (dueAt && !Number.isFinite(Date.parse(dueAt))) return null;
      const previousOwner = clean(campaign.owner, 80);
      const previousDueAt = clean(campaign.dueAt, 40);
      const previousStatus = clean(campaign.workflowStatus, 30);
      if (requestedStatus === 'blocked' && !(blockerReason || campaign.blockerReason)) return null;
      const now = new Date().toISOString();
      campaign.owner = owner;
      campaign.dueAt = dueAt;
      campaign.workflowStatus = requestedStatus;
      campaign.taskNotes = clean(input.notes, 400);
      campaign.assignedAt = requestedStatus === 'unassigned' ? '' : (campaign.assignedAt || now);
      campaign.startedAt = requestedStatus === 'in_progress' ? (campaign.startedAt || now) : campaign.startedAt || '';
      if (!Array.isArray(campaign.blockerHistory)) campaign.blockerHistory = [];
      if (requestedStatus === 'blocked') {
        const wasBlocked = previousStatus === 'blocked';
        campaign.blockerReason = blockerReason || clean(campaign.blockerReason, 240);
        campaign.blockerType = wasBlocked ? (Object.prototype.hasOwnProperty.call(BLOCKER_TYPE_DEFINITIONS, clean(campaign.blockerType, 40)) ? clean(campaign.blockerType, 40) : blockerType) : blockerType;
        campaign.blockedAt = wasBlocked && campaign.blockedAt ? campaign.blockedAt : now;
        campaign.resolvedAt = '';
        if (!wasBlocked) {
          campaign.blockerHistory.push({
            id: crypto.randomUUID(),
            type: campaign.blockerType,
            label: blockerTypeLabel(campaign.blockerType),
            reason: campaign.blockerReason,
            blockedAt: campaign.blockedAt,
            resolvedAt: '',
            durationHours: 0
          });
        } else if (campaign.blockerHistory.length) {
          const currentHistory = campaign.blockerHistory[campaign.blockerHistory.length - 1];
          currentHistory.type = campaign.blockerType;
          currentHistory.label = blockerTypeLabel(campaign.blockerType);
          currentHistory.reason = campaign.blockerReason;
          currentHistory.blockedAt = campaign.blockedAt;
        }
      } else if (previousStatus === 'blocked') {
        const resolvedAt = now;
        const blockedAt = Date.parse(campaign.blockedAt || '');
        const durationHours = Number.isFinite(blockedAt)
          ? Math.max(0, Math.round(((Date.parse(resolvedAt) - blockedAt) / 3600000) * 10) / 10)
          : 0;
        campaign.resolvedAt = resolvedAt;
        campaign.blockerHistory = campaign.blockerHistory || [];
        const currentHistory = campaign.blockerHistory[campaign.blockerHistory.length - 1];
        if (currentHistory && !currentHistory.resolvedAt) {
          currentHistory.resolvedAt = resolvedAt;
          currentHistory.durationHours = durationHours;
        }
        campaign.blockerReason = '';
        campaign.blockerType = 'other';
        campaign.blockedAt = '';
      } else {
        campaign.blockerReason = blockerReason || '';
        campaign.blockerType = blockerType;
      }
      if (campaign.blockerHistory.length > 30) campaign.blockerHistory.splice(0, campaign.blockerHistory.length - 30);
      campaign.updatedAt = now;
      const activityType = requestedStatus === 'blocked' && previousStatus !== 'blocked'
        ? 'blocked'
        : previousStatus === 'blocked' && requestedStatus !== 'blocked'
          ? 'unblocked'
          : requestedStatus === 'in_progress' && previousStatus !== 'in_progress'
            ? 'started'
            : previousOwner !== owner
              ? 'assigned'
              : previousDueAt !== dueAt
                ? 'sla_updated'
                : 'task_updated';
      appendCampaignActivity(campaign, activityType, {
        owner,
        dueAt,
        workflowStatus: requestedStatus,
        blockerType: blockerTypeLabel(campaign.blockerType),
        blockerReason: campaign.blockerReason || '',
        previousOwner,
        previousDueAt,
        previousStatus
      }, actor);
      invalidateRevenueCaches();
      void persistRevenue();
      return { ...campaign, task: taskWorkflow(campaign) };
    }
    function customerSegments() {
      const now = Date.now();
      if (segmentsCache && now - segmentsCacheAt < REVENUE_SEGMENTS_CACHE_MS) return segmentsCache;
      const ordersByPhone = new Map();
      for (const order of orders.all()) {
        if (!order.phone || order.status === 'cancelled') continue;
        const rows = ordersByPhone.get(order.phone) || [];
        rows.push(order);
        ordersByPhone.set(order.phone, rows);
      }
  
      const reservationsByPhone = new Map();
      for (const reservation of reservations.all()) {
        if (!reservation.phone || reservation.status === 'cancelled') continue;
        reservationsByPhone.set(reservation.phone, (reservationsByPhone.get(reservation.phone) || 0) + 1);
      }
  
      const actionMetricsBySegment = new Map();
      for (const action of campaigns) {
        if (action.type !== 'segment_action') continue;
        const key = clean(action.reference, 80);
        if (!key) continue;
        const current = actionMetricsBySegment.get(key) || { drafts: 0, executed: 0, converted: 0, ignored: 0, attributedOrders: 0, measuredRevenue: 0 };
        current[action.status === 'draft' || action.status === 'executed' || action.status === 'converted' || action.status === 'ignored' ? action.status : 'draft'] += 1;
        if (action.status === 'converted' && action.attribution?.matchedOrder) current.attributedOrders += 1;
        current.measuredRevenue += Math.max(0, number(action.resultRevenue));
        actionMetricsBySegment.set(key, current);
      }
  
      const rows = customers.all().map(customer => {
        const customerOrders = ordersByPhone.get(customer.phone) || [];
        let totalRevenue = 0;
        let lastOrderAt = '';
        for (const order of customerOrders) {
          totalRevenue += number(order.total);
          const candidate = orderCompletionTimestamp(order);
          if (candidate && (!lastOrderAt || candidate > lastOrderAt)) lastOrderAt = candidate;
        }
        if (!lastOrderAt) lastOrderAt = customer.lastOrderAt || '';
        const daysSinceLastOrder = lastOrderAt ? Math.floor((now - Date.parse(lastOrderAt)) / 86400000) : null;
        const reservationCount = reservationsByPhone.get(customer.phone) || 0;
        return {
          id: customer.id,
          name: clean(customer.name || 'عميل', 80),
          phone: clean(customer.phone, 40),
          orderCount: customerOrders.length,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          averageOrderValue: customerOrders.length ? Math.round((totalRevenue / customerOrders.length) * 100) / 100 : 0,
          lastOrderAt,
          daysSinceLastOrder,
          reservationCount
        };
      }).filter(item => item.orderCount > 0 || item.reservationCount > 0);
  
      const definitions = [
        { key:'high_value', label:'عملاء القيمة العالية', description:'عملاء معروفون تجاوز إجمالي طلباتهم 500 AED.', action:'اطلب من الفريق إعداد تجربة مميزة أو عرض مناسب يحافظ على العلاقة، مع مراجعة موافقة التواصل.', match:item => item.totalRevenue >= 500 },
        { key:'repeat', label:'العملاء المتكررون', description:'عملاء لديهم طلبان مكتملان أو أكثر.', action:'حوّل تكرار الشراء إلى زيارة أو طلب جديد عبر عرض مرتبط بآخر مشتريات العميل، بعد التحقق من الموافقة.', match:item => item.orderCount >= 2 },
        { key:'lapsed', label:'عملاء مهددون بالفقد', description:'عملاء متكررون مرّ على آخر طلب لهم 21 يومًا أو أكثر.', action:'راجع آخر مشتريات العميل وجهّز محاولة إعادة تنشيط مناسبة بعد التحقق من الموافقة.', match:item => item.orderCount >= 2 && item.daysSinceLastOrder !== null && item.daysSinceLastOrder >= 21 },
        { key:'recent', label:'عملاء نشطون مؤخرًا', description:'عميل لديه طلب خلال آخر 30 يومًا.', action:'استفد من النشاط الحديث باقتراح مكمل أو زيارة قادمة، مع الالتزام بالموافقة المطلوبة.', match:item => item.daysSinceLastOrder !== null && item.daysSinceLastOrder >= 0 && item.daysSinceLastOrder <= 30 },
        { key:'reservation_led', label:'عملاء مرتبطون بالحجوزات', description:'عملاء لديهم حجز نشط مرتبط بهويتهم.', action:'جهّز اقتراح Pre-order أو إضافة مناسبة قبل الزيارة، مع التحقق من الموافقة قبل التواصل.', match:item => item.reservationCount > 0 }
      ];
  
      const result = definitions.map(definition => {
        const members = rows.filter(definition.match).sort((a,b) => b.totalRevenue - a.totalRevenue || b.orderCount - a.orderCount);
        return {
          key: definition.key,
          label: definition.label,
          description: definition.description,
          count: members.length,
          totalRevenue: Math.round(members.reduce((sum, item) => sum + item.totalRevenue, 0) * 100) / 100,
          averageRevenue: members.length ? Math.round((members.reduce((sum, item) => sum + item.totalRevenue, 0) / members.length) * 100) / 100 : 0,
          recommendedAction: definition.action,
          actionType: 'segment_action',
          actionReference: definition.key,
          actionRequiresConsent: true,
          actionSendable: false,
          actionMetrics: (() => {
            const metrics = actionMetricsBySegment.get(definition.key) || { drafts: 0, executed: 0, converted: 0, ignored: 0, attributedOrders: 0, measuredRevenue: 0 };
            return {
              drafts: metrics.drafts,
              executed: metrics.executed,
              converted: metrics.converted,
              ignored: metrics.ignored,
              attributedOrders: metrics.attributedOrders,
              measuredRevenue: Math.round(metrics.measuredRevenue * 100) / 100
            };
          })(),
          members: members.slice(0, 100)
        };
      });
      segmentsCache = result;
      segmentsCacheAt = now;
      return result;
    }
  
    function customer360(customerId) {
      const id = clean(customerId, 100);
      const customer = customers.findById(id);
      if (!customer) return null;
      const customerOrders = stateQueries.filterOrders(order => order.status === 'completed' && order.phone && customer.phone && order.phone === customer.phone);
      const customerReservations = stateQueries.filterReservations(item => item.phone && customer.phone && item.phone === customer.phone);
      const customerEvents = events.filter(item => item.customerId === id).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 40);
      const summary = buildSummary();
      const opportunities = [
        ...(summary.opportunities?.inactiveCustomers || []).filter(item => item.id === id).map(item => ({...item,type:'inactive_customer'})),
        ...(summary.opportunities?.returnCustomers || []).filter(item => item.id === id).map(item => ({...item,type:'returning_customer'})),
        ...(summary.opportunities?.upcomingReservations || []).filter(item => item.phone === customer.phone).map(item => ({...item,type:'upcoming_reservation'}))
      ];
      const validOrders = customerOrders.filter(order => order.status !== 'cancelled');
      const totalOrderValue = validOrders.reduce((sum, order) => sum + number(order.total), 0);
      const orderTimes = validOrders.map(order => Date.parse(orderCompletionTimestamp(order))).filter(Number.isFinite).sort((a,b)=>a-b);
      const gaps = [];
      for(let index=1; index<orderTimes.length; index+=1){
        const gapDays=(orderTimes[index]-orderTimes[index-1])/86400000;
        if(gapDays>=1&&gapDays<=120)gaps.push(gapDays);
      }
      const averageReturnDays=gaps.length?Math.round((gaps.reduce((sum,value)=>sum+value,0)/gaps.length)*10)/10:null;
      const lastOrder=validOrders.slice().sort((a,b)=>Date.parse(orderCompletionTimestamp(b))-Date.parse(orderCompletionTimestamp(a)))[0]||null;
      const daysSinceLastOrder=lastOrder?Math.max(0,Math.floor((Date.now()-Date.parse(orderCompletionTimestamp(lastOrder)))/86400000)):null;
      const productMap=new Map();
      for(const order of validOrders){
        for(const item of Array.isArray(order.items)?order.items:[]){
          const productId=clean(item.productId,50);
          if(!productId)continue;
          const current=productMap.get(productId)||{productId,quantity:0,orders:0};
          current.quantity+=Math.max(1,Math.min(20,Math.round(number(item.quantity,1))));
          current.orders+=1;
          productMap.set(productId,current);
        }
      }
      const favoriteProducts=[...productMap.values()].sort((a,b)=>b.quantity-a.quantity||b.orders-a.orders).slice(0,5).map(item=>{
        const product=stateQueries.findProduct(row=>row.id===item.productId)||{};
        return {productId:item.productId,name:clean(product.nameAr||product.nameEn||item.productId,100),quantity:item.quantity,orders:item.orders};
      });
      const eventCounts={};
      for(const event of customerEvents)eventCounts[event.eventName]=(eventCounts[event.eventName]||0)+1;
      const relatedActions=campaigns
        .filter(item=>item.customerId===id||(['inactive_customer','returning_customer'].includes(item.type)&&item.reference===id))
        .sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||'')-Date.parse(a.updatedAt||a.createdAt||''))
        .slice(0,20)
        .map(item=>({
          id:item.id,type:item.type,title:item.title,status:item.status,
          workflowStatus:item.workflowStatus||'',
          owner:item.owner||'',
          dueAt:item.dueAt||'',
          blockerReason:item.blockerReason||'',
          resultRevenue:number(item.resultRevenue),
          orderId:item.orderId||item.attribution?.orderId||'',
          outcomeReason:item.outcomeReason||'',
          outcomeReasonNote:item.outcomeReasonNote||'',
          completedAt:item.completedAt||'',
          updatedAt:item.updatedAt||item.createdAt||''
        }));
      const opportunityTimeline = opportunities.slice(0, 20).map(item => ({
        type: 'opportunity',
        label: 'فرصة',
        title: clean(item.reason || item.recommendedAction || 'فرصة مرتبطة بالعميل', 160),
        details: clean(item.recommendedAction || '', 240),
        status: clean(item.priority || '', 40),
        value: number(item.potentialValue),
        at: item.createdAt || item.detectedAt || item.updatedAt || new Date().toISOString(),
        reference: clean(item.id || item.reference || '', 120),
        opportunityType: clean(item.type || '', 40)
      }));
      const orderTimeline = validOrders.slice().map(order => ({
        type: 'order',
        label: 'طلب',
        title: 'طلب #' + clean(order.id, 40),
        details: clean(order.orderType || '', 80),
        status: clean(order.status || '', 40),
        value: number(order.total),
        at: order.createdAt || order.updatedAt || '',
        reference: clean(order.id, 40)
      }));
      const reservationTimeline = customerReservations.slice().map(item => ({
        type: 'reservation',
        label: 'حجز',
        title: 'حجز لـ ' + Number(item.guests || 0) + ' أشخاص',
        details: [clean(item.date, 30), clean(item.time, 20)].filter(Boolean).join(' · '),
        status: clean(item.status || '', 40),
        value: 0,
        at: item.createdAt || '',
        reference: clean(item.id, 40),
        scheduledAt: [clean(item.date, 30), clean(item.time, 20)].filter(Boolean).join(' ')
      }));
      const actionTimeline = relatedActions.map(item => ({
        type: 'action',
        label: 'إجراء إيراد',
        title: clean(item.title || item.type || 'إجراء', 160),
        details: item.orderId ? 'مرتبط بالطلب #' + clean(item.orderId, 40) : '',
        status: clean(item.status || '', 40),
        value: number(item.resultRevenue),
        at: item.updatedAt || ''
      }));
      const eventLabels = {
        menu_view: 'شاهد المنيو',
        item_view: 'شاهد منتجًا',
        add_to_cart: 'أضاف للسلة',
        cart_updated: 'حدّث السلة',
        checkout_started: 'بدأ الدفع',
        order_created: 'أنشأ طلبًا',
        order_completed: 'أكمل الطلب',
        reservation_created: 'أنشأ حجزًا'
      };
      const eventTimeline = customerEvents.map(item => {
        const product = item.productId ? stateQueries.findProduct(row => row.id === item.productId) : null;
        return {
          type: 'event',
          label: eventLabels[item.eventName] || item.eventName,
          title: product ? clean(product.nameAr || product.nameEn || product.id, 120) : clean(eventLabels[item.eventName] || item.eventName, 120),
          details: item.productId ? 'منتج مرتبط: ' + clean(item.productId, 50) : '',
          status: '',
          value: number(item.orderValue || item.cartValue),
          at: item.createdAt || '',
          eventName: clean(item.eventName, 40)
        };
      });
      const timeline = [...opportunityTimeline, ...actionTimeline, ...orderTimeline, ...reservationTimeline, ...eventTimeline]
        .filter(item => item.at)
        .sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''))
        .slice(0, 60);
      const timelineCounts = {
        all: timeline.length,
        order: timeline.filter(item => item.type === 'order').length,
        reservation: timeline.filter(item => item.type === 'reservation').length,
        event: timeline.filter(item => item.type === 'event').length,
        action: timeline.filter(item => item.type === 'action').length,
        opportunity: timeline.filter(item => item.type === 'opportunity').length
      };
      const primaryOpportunity=opportunities.slice().sort((a,b)=>number(b.priorityScore)-number(a.priorityScore))[0]||null;
      const primaryLearning=primaryOpportunity
        ? outcomeLearningSignal(summary.outcomeLearning, 'revenue_opportunity', clean(primaryOpportunity.type || '', 50))
        : null;
      const primaryLearningPolicy=outcomeLearningPolicy(primaryLearning);
      const openActions=relatedActions.filter(item=>item.status==='draft');
      const blockedActions=openActions.filter(item=>item.workflowStatus==='blocked');
      const overdueActions=openActions.filter(item=>item.workflowStatus==='overdue'||item.workflowStatus==='escalated');
      const nextOpenAction=openActions.slice().sort((a,b)=>{
        const aTime=Date.parse(a.dueAt||'')||Number.MAX_SAFE_INTEGER;
        const bTime=Date.parse(b.dueAt||'')||Number.MAX_SAFE_INTEGER;
        return aTime-bTime;
      })[0]||null;
      const decision = primaryOpportunity
        ? {
            key: primaryOpportunity.type || 'opportunity',
            label: primaryOpportunity.type==='upcoming_reservation' ? 'حجز قادم' : primaryOpportunity.type==='inactive_customer' ? 'إعادة تنشيط' : primaryOpportunity.type==='returning_customer' ? 'موعد عودة محتمل' : 'فرصة عميل',
            reason: clean(primaryOpportunity.reason || '', 220),
            recommendedAction: clean(primaryLearningPolicy?.avoidRepeat ? primaryLearningPolicy.alternativeAction : (primaryLearning?.learningAction || primaryOpportunity.recommendedAction || ''), 340),
            potentialValue: number(primaryOpportunity.potentialValue),
            learningSignal: primaryLearning
              ? { signalKey: primaryLearning.signalKey, signalLabel: primaryLearning.signalLabel, sampleSize: primaryLearning.sampleSize, conversionRate: primaryLearning.conversionRate, topReason: primaryLearning.topReason, topReasonCount: primaryLearning.topReasonCount, measuredRevenue: primaryLearning.measuredRevenue, applied: true }
              : null,
            learningPolicy: primaryLearningPolicy,
            stateKey: !customer.marketingOptIn ? 'needs_consent' : blockedActions.length ? 'blocked' : overdueActions.length ? 'overdue' : openActions.length ? 'open' : 'observe',
            ready: customer.marketingOptIn && blockedActions.length===0 && overdueActions.length===0,
            consentRequired: !customer.marketingOptIn,
            openActions: openActions.length,
            blockedActions: blockedActions.length,
            overdueActions: overdueActions.length,
            nextOpenActionId: nextOpenAction?.id || '',
            actionType: clean(primaryOpportunity.type || '', 40),
            actionReference: clean(primaryOpportunity.id || primaryOpportunity.reference || '', 120)
          }
        : {
            key: validOrders.length>=2 ? 'repeat_customer' : validOrders.length===1 ? 'first_repeat_window' : 'known_customer',
            label: validOrders.length>=2 ? 'عميل متكرر' : validOrders.length===1 ? 'بعد أول طلب' : 'عميل معروف',
            reason: validOrders.length ? 'يوجد سجل طلبات؛ لا توجد فرصة تشغيلية مميزة مسجلة حاليًا.' : 'لا توجد طلبات مكتملة مرتبطة بالعميل حاليًا.',
            recommendedAction: validOrders.length>=1 ? 'راجع آخر طلب ونمط التفاعل قبل إنشاء إجراء جديد.' : 'تابع أول تفاعل أو طلب قبل إنشاء إجراء موجه.',
            potentialValue: 0,
            stateKey: !customer.marketingOptIn ? 'needs_consent' : blockedActions.length ? 'blocked' : overdueActions.length ? 'overdue' : openActions.length ? 'open' : 'observe',
            ready: customer.marketingOptIn && blockedActions.length===0 && overdueActions.length===0,
            consentRequired: !customer.marketingOptIn,
            openActions: openActions.length,
            blockedActions: blockedActions.length,
            overdueActions: overdueActions.length,
            nextOpenActionId: nextOpenAction?.id || ''
          };
      const nextAction=!customer.marketingOptIn
        ? 'تحقق من موافقة التواصل قبل تنفيذ أي إجراء موجه للعميل.'
        : blockedActions.length
          ? 'حل العائق التشغيلي المسجل في الإجراء المفتوح، ثم أعد المهمة إلى مسندة أو قيد التنفيذ.'
          : overdueActions.length
            ? 'راجع المهمة المتأخرة وحدّث حالتها أو سجّل النتيجة قبل إنشاء إجراء جديد.'
            : nextOpenAction
              ? 'تابع الإجراء المفتوح: ' + clean(nextOpenAction.title || 'مهمة الإيراد', 140)
              : primaryLearningPolicy?.avoidRepeat
              ? clean(primaryLearningPolicy.alternativeAction, 300)
              : primaryLearning
                ? 'طبّق التعلم المسجل لهذا النوع من الفرص: ' + clean(primaryLearning.learningAction, 260)
                : (primaryOpportunity?.recommendedAction||'راجع آخر نشاط للعميل وحدد الإجراء المناسب.');
      return {
        customer: {
          id: customer.id,
          name: customer.name || 'عميل',
          phone: customer.phone || '',
          orderCount: Number(validOrders.length),
          reservationCount: customerReservations.filter(item => item.status !== 'cancelled').length,
          lastOrderAt: customer.lastOrderAt || lastOrder?.createdAt || '',
          lastReservationAt: customer.lastReservationAt || '',
          marketingOptIn: Boolean(customer.marketingOptIn),
          internalNotes: clean(customer.internalNotes || '', 2000),
          internalNotesUpdatedAt: clean(customer.internalNotesUpdatedAt || '', 40)
        },
        summary: {
          totalOrderValue: Math.round(totalOrderValue * 100) / 100,
          averageOrderValue: validOrders.length ? Math.round((totalOrderValue / validOrders.length) * 100) / 100 : 0,
          completedOrders: customerOrders.filter(order => order.status === 'completed').length,
          totalReservations: customerReservations.filter(item => item.status !== 'cancelled').length,
          daysSinceLastOrder,
          averageReturnDays,
          lastOrderValue: number(lastOrder?.total),
          lastActivityAt: [...customerOrders.map(item => item.updatedAt || item.createdAt), ...customerReservations.map(item => item.createdAt), ...customerEvents.map(item => item.createdAt)].filter(Boolean).sort().pop() || ''
        },
        behavior: {
          favoriteProducts,
          lastOrderItems: Array.isArray(lastOrder?.items) ? lastOrder.items.slice(0,20).map(item=>({productId:clean(item.productId,50),nameAr:clean(item.nameAr||'',120),quantity:Math.max(1,Math.min(20,Math.round(number(item.quantity,1)))),unitPrice:number(item.unitPrice),lineTotal:number(item.lineTotal)})) : [],
          eventCounts
        },
        orders: customerOrders.slice().sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30).map(order => ({
          id: order.id,
          total: number(order.total),
          status: order.status,
          orderType: order.orderType,
          createdAt: order.createdAt
        })),
        reservations: customerReservations.slice().sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 30).map(item => ({
          id:item.id, date:item.date, time:item.time, guests:Number(item.guests||0), status:item.status, eventSlug:item.eventSlug || ''
        })),
        timelineCounts,
        recentEvents: customerEvents.map(item => ({
          eventName:item.eventName, productId:item.productId, orderId:item.orderId, createdAt:item.createdAt
        })),
        opportunities,
        relatedActions,
        decision,
        nextAction
      };
    }
  
    function campaignSummary() {
      const now = Date.now();
      const taskRows = campaigns.filter(item => item.status === 'draft').map(item => taskWorkflow(item, now));
      const recent = [...campaigns]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 30)
        .map(item => ({ ...item, task: taskWorkflow(item, now) }));
      const dayKey = iso => {
        const parsed = Date.parse(iso || '');
        if (!Number.isFinite(parsed)) return '';
        return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(parsed));
      };
      const todayKey = dayKey(new Date(now).toISOString());
      const taskItems = campaigns
        .filter(item => item.status === 'draft' || dayKey(item.completedAt) === todayKey)
        .sort((a,b) => {
          const aTime = Date.parse(a.dueAt || a.completedAt || a.createdAt || '') || Number.MAX_SAFE_INTEGER;
          const bTime = Date.parse(b.dueAt || b.completedAt || b.createdAt || '') || Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })
        .map(item => ({ ...item, task: taskWorkflow(item, now) }));
      const taskBoard = {
        generatedAt: new Date(now).toISOString(),
        date: todayKey,
        blocked: taskItems.filter(item => item.status === 'draft' && item.task.key === 'blocked'),
        overdue: taskItems.filter(item => item.status === 'draft' && item.task.overdue),
        inProgress: taskItems.filter(item => item.status === 'draft' && !item.task.overdue && item.task.key === 'in_progress'),
        today: taskItems.filter(item => item.status === 'draft' && !item.task.overdue && item.task.key !== 'in_progress' && item.task.key !== 'blocked' && dayKey(item.dueAt) === todayKey),
        doneToday: taskItems.filter(item => item.status !== 'draft' && dayKey(item.completedAt || item.updatedAt) === todayKey)
      };
      taskBoard.counts = {
        blocked: taskBoard.blocked.length,
        overdue: taskBoard.overdue.length,
        inProgress: taskBoard.inProgress.length,
        today: taskBoard.today.length,
        doneToday: taskBoard.doneToday.length
      };
  
      const openTaskRows = campaigns
        .filter(item => item.status === 'draft')
        .map(item => ({ ...item, task: taskWorkflow(item, now) }));
      const briefingCandidates = [];
      for (const row of openTaskRows) {
        const dueAt = Date.parse(row.dueAt || '');
        const hoursToDue = Number.isFinite(dueAt) ? (dueAt - now) / 3600000 : null;
        let urgency = 0;
        let reason = '';
        if (row.task.key === 'blocked') {
          urgency = 950;
          reason = 'المهمة محجوبة بسبب عائق تشغيلي.';
        } else if (row.task.key === 'escalated') {
          urgency = 1000;
          reason = 'تجاوز الـSLA بأكثر من 24 ساعة.';
        } else if (row.task.key === 'overdue') {
          urgency = 900;
          reason = 'تجاوز موعد الـSLA.';
        } else if (!row.owner) {
          urgency = hoursToDue !== null && hoursToDue <= 0 ? 850 : hoursToDue !== null && hoursToDue <= 4 ? 800 : 650;
          reason = 'المهمة غير مسندة لمسؤول.';
        } else if (hoursToDue !== null && hoursToDue <= 4) {
          urgency = 750;
          reason = 'موعد الـSLA قريب خلال 4 ساعات.';
        } else if (row.task.key === 'in_progress') {
          urgency = 500;
          reason = 'المهمة قيد التنفيذ.';
        }
        if (urgency > 0) {
          briefingCandidates.push({
            id: row.id,
            title: row.title,
            owner: row.owner || 'غير محدد',
            status: row.task.key,
            statusLabel: row.task.label,
            dueAt: row.dueAt || '',
            potentialValue: number(row.potentialValue),
            urgency,
            reason,
            recommendedAction: row.task.key === 'blocked'
              ? 'حل العائق المسجل ثم أعد المهمة إلى مسندة أو قيد التنفيذ.'
              : row.task.key === 'escalated' || row.task.key === 'overdue'
                ? 'راجع المسؤول وحدّث الحالة أو سجّل النتيجة فورًا.'
                : !row.owner
                ? 'عيّن مسؤولًا وحدد SLA واضحًا قبل ترك المهمة.'
                : hoursToDue !== null && hoursToDue <= 4
                  ? 'ابدأ التنفيذ الآن لتقليل خطر تجاوز الـSLA.'
                  : 'تابع التقدم وسجّل النتيجة عند الإغلاق.'
          });
        }
      }
      const workloadRows = campaigns
        .filter(item => item.status === 'draft')
        .map(item => ({ ...item, task: taskWorkflow(item, now) }));
      const workloadMap = new Map();
      for (const row of workloadRows) {
        const owner = clean(row.owner, 80) || 'غير مسند';
        const current = workloadMap.get(owner) || { owner, open:0, blocked:0, overdue:0, escalated:0, inProgress:0, dueSoon:0, potentialValue:0 };
        current.open += 1;
        current.potentialValue += Math.max(0, number(row.potentialValue));
        if (row.task.key === 'blocked') current.blocked += 1;
        if (row.task.key === 'overdue') current.overdue += 1;
        if (row.task.key === 'escalated') { current.overdue += 1; current.escalated += 1; }
        if (row.task.key === 'in_progress') current.inProgress += 1;
        const dueAt = Date.parse(row.dueAt || '');
        if (Number.isFinite(dueAt) && dueAt >= now && dueAt <= now + 4 * 3600000) current.dueSoon += 1;
        workloadMap.set(owner, current);
      }
      const taskWorkloadRows = [...workloadMap.values()]
        .map(row => ({
          ...row,
          potentialValue: Math.round(row.potentialValue * 100) / 100
        }))
        .sort((a,b) => b.open - a.open || b.overdue - a.overdue || b.potentialValue - a.potentialValue);
      const taskWorkload = {
        rows: taskWorkloadRows,
        counts: {
          owners: taskWorkloadRows.filter(row => row.owner !== 'غير مسند').length,
          open: workloadRows.length,
          unassigned: workloadRows.filter(row => !row.owner).length,
          blocked: workloadRows.filter(row => row.task.key === 'blocked').length,
          overdue: workloadRows.filter(row => row.task.overdue).length
        }
      };
  
      const routingOwners = taskWorkloadRows
        .filter(row => row.owner !== 'غير مسند')
        .map(row => ({
          owner: row.owner,
          loadScore: row.open + (row.inProgress * 1.5) + (row.overdue * 4) + (row.escalated * 6) + (row.dueSoon * 2),
          open: row.open,
          inProgress: row.inProgress,
          overdue: row.overdue,
          escalated: row.escalated,
          blocked: row.blocked,
          dueSoon: row.dueSoon
        }))
        .sort((a,b) => a.loadScore - b.loadScore || a.open - b.open || a.overdue - b.overdue || a.owner.localeCompare(b.owner, 'ar'));
  
      const completedTasks = campaigns.filter(item => item.status !== 'draft');
      const measurableTasks = completedTasks.map(item => {
        const startedAt = Date.parse(item.startedAt || item.assignedAt || '');
        const completedAt = Date.parse(item.completedAt || '');
        const dueAt = Date.parse(item.dueAt || '');
        const durationHours = Number.isFinite(startedAt) && Number.isFinite(completedAt)
          ? Math.max(0, (completedAt - startedAt) / 3600000)
          : null;
        const hadSla = Number.isFinite(dueAt);
        const onTime = hadSla && Number.isFinite(completedAt) ? completedAt <= dueAt : null;
        return { item, durationHours, onTime, hadSla };
      });
      const slaTasks = measurableTasks.filter(row => row.hadSla && row.onTime !== null);
      const ownerMap = new Map();
      for (const row of measurableTasks) {
        const owner = clean(row.item.owner, 80);
        if (!owner) continue;
        const current = ownerMap.get(owner) || { owner, completed:0, slaMeasured:0, onTime:0, overdueCompleted:0, durationHours:[] };
        current.completed += 1;
        if (row.onTime !== null) {
          current.slaMeasured += 1;
          if (row.onTime) current.onTime += 1;
          else current.overdueCompleted += 1;
        }
        if (row.durationHours !== null) current.durationHours.push(row.durationHours);
        ownerMap.set(owner, current);
      }
      const byOwner = [...ownerMap.values()]
        .sort((a,b) => b.completed - a.completed || b.slaMeasured - a.slaMeasured)
        .map(row => ({
          owner: row.owner,
          completed: row.completed,
          slaMeasured: row.slaMeasured,
          onTime: row.onTime,
          overdueCompleted: row.overdueCompleted,
          onTimeRate: row.slaMeasured ? Math.round((row.onTime / row.slaMeasured) * 1000) / 10 : null,
          averageCompletionHours: row.durationHours.length
            ? Math.round((row.durationHours.reduce((sum,value) => sum + value, 0) / row.durationHours.length) * 10) / 10
            : null
        }));
      const durationRows = measurableTasks.filter(row => row.durationHours !== null);

      const ownerPerformanceMap = new Map(
        byOwner
          .filter(row => Number(row.completed || 0) > 0)
          .map(row => [row.owner, row])
      );
      const ownerTypePerformance = new Map();
      for (const item of completedTasks) {
        const owner = clean(item.owner, 80);
        if (!owner) continue;
        const sourceType = clean(item.sourceType || 'revenue_opportunity', 50);
        const sourceKey = clean(item.sourceKey || item.type || item.reference || 'unknown', 120);
        const key = owner + ':' + sourceType + ':' + sourceKey;
        const current = ownerTypePerformance.get(key) || { owner, completed:0, slaMeasured:0, onTime:0, durations:[] };
        current.completed += 1;
        const dueAt = Date.parse(item.dueAt || '');
        const completedAt = Date.parse(item.completedAt || '');
        if (Number.isFinite(dueAt) && Number.isFinite(completedAt)) {
          current.slaMeasured += 1;
          if (completedAt <= dueAt) current.onTime += 1;
        }
        const startedAt = Date.parse(item.startedAt || item.assignedAt || '');
        if (Number.isFinite(startedAt) && Number.isFinite(completedAt)) current.durations.push(Math.max(0, (completedAt - startedAt) / 3600000));
        ownerTypePerformance.set(key, current);
      }
      const routingTaskType = row => ({
        abandoned_cart:'استرجاع سلة',
        inactive_customer:'إعادة تنشيط عميل',
        returning_customer:'إعادة طلب لعميل عائد',
        upcoming_reservation:'تجهيز Pre-order للحجز',
        product_interest:'متابعة اهتمام منتج',
        segment_action:'إجراء شريحة',
        alert_action:'معالجة تنبيه إيرادات'
      }[clean(row.type, 50)] || clean(row.task?.label || 'مهمة إيرادات', 80));
      const routingSlaHours = (row, owner, typePerf) => {
        const dueAt = Date.parse(row.dueAt || '');
        if (Number.isFinite(dueAt)) return Math.max(1, Math.round((dueAt - now) / 3600000));
        const avg = typePerf?.durations?.length
          ? typePerf.durations.reduce((sum, value) => sum + value, 0) / typePerf.durations.length
          : owner ? Number(owner.averageCompletionHours || 0) : 0;
        if (avg > 0) return Math.max(4, Math.min(48, Math.ceil(avg * 1.5)));
        return number(row.potentialValue) >= 300 ? 8 : 24;
      };
      const routingOwnersWithPerformance = routingOwners.map(owner => {
        const performance = ownerPerformanceMap.get(owner.owner);
        const onTimeRate = performance?.onTimeRate;
        const performancePenalty = onTimeRate === null || onTimeRate === undefined ? 0 : Math.max(0, Math.min(8, (100 - Number(onTimeRate)) / 12.5));
        return {
          ...owner,
          onTimeRate,
          completed: Number(performance?.completed || 0),
          performancePenalty
        };
      });
      const routingRecommendations = [];
      const virtualOwners = routingOwnersWithPerformance.map(row => ({ ...row }));
      for (const row of openTaskRows.filter(item => !item.owner).sort((a,b) => number(b.potentialValue) - number(a.potentialValue))) {
        const eligible = virtualOwners.slice().map(owner => {
          const exactKey = owner.owner + ':' + clean(row.sourceType || 'revenue_opportunity', 50) + ':' + clean(row.sourceKey || row.type || row.reference || 'unknown', 120);
          const typePerf = ownerTypePerformance.get(exactKey);
          const historicalRate = typePerf?.slaMeasured ? Math.round((typePerf.onTime / typePerf.slaMeasured) * 1000) / 10 : owner.onTimeRate;
          const fitPenalty = typePerf?.slaMeasured >= 3
            ? Math.max(0, Math.min(10, (100 - Number(historicalRate || 0)) / 10))
            : owner.performancePenalty;
          return { owner, typePerf, historicalRate, routeScore: owner.loadScore + fitPenalty };
        }).sort((a,b) => a.routeScore - b.routeScore || a.owner.open - b.owner.open || a.owner.overdue - b.owner.overdue || a.owner.owner.localeCompare(b.owner.owner, 'ar'));
        const chosen = eligible[0];
        if (!chosen) break;
        const suggestion = chosen.owner;
        const slaHours = routingSlaHours(row, ownerPerformanceMap.get(suggestion.owner), chosen.typePerf);
        const historical = chosen.historicalRate !== null && chosen.historicalRate !== undefined
          ? `الأداء التاريخي على SLA: ${Number(chosen.historicalRate).toFixed(1)}%.`
          : 'لا توجد بيانات SLA تاريخية كافية لهذا المسؤول.';
        routingRecommendations.push({
          id: row.id,
          title: row.title,
          type: row.type || '',
          taskType: routingTaskType(row),
          potentialValue: Math.round(Math.max(0, number(row.potentialValue)) * 100) / 100,
          dueAt: row.dueAt || '',
          suggestedSlaHours: slaHours,
          status: row.task.key,
          statusLabel: row.task.label,
          suggestedOwner: suggestion.owner,
          suggestedOwnerOpenTasks: suggestion.open,
          suggestedOwnerOverdueTasks: suggestion.overdue,
          suggestedOwnerOnTimeRate: chosen.historicalRate ?? null,
          reason: `اقتراح مبدئي يجمع بين عبء العمل الحالي و${historical}`,
          note: 'الاقتراح لا يعيّن المهمة تلقائيًا؛ يعتمد على البيانات الحالية والأداء التاريخي المتاح فقط، ويظل قرار التعيين بيد المدير.'
        });
        suggestion.open += 1;
        suggestion.loadScore += 1;
      }
      const taskRouting = {
        generatedAt: new Date(now).toISOString(),
        availableOwners: routingOwnersWithPerformance.map(row => ({
          owner: row.owner,
          open: row.open,
          blocked: row.blocked,
          inProgress: row.inProgress,
          overdue: row.overdue,
          escalated: row.escalated,
          dueSoon: row.dueSoon,
          completed: row.completed,
          onTimeRate: row.onTimeRate,
          loadScore: Math.round((row.loadScore + row.performancePenalty) * 10) / 10
        })),
        recommendations: routingRecommendations,
        unassignedCount: workloadRows.filter(item => !item.owner).length,
        blockedCount: workloadRows.filter(item => item.task.key === 'blocked').length,
        note: routingOwners.length
          ? 'الاقتراحات تجمع بين عبء العمل الحالي والأداء التاريخي المتاح لكل مسؤول ونوع المهمة، ولا يتم التعيين تلقائيًا.'
          : 'لا يوجد مسؤول نشط معروف من المهام الحالية لتوليد اقتراح توزيع.'
      };
  
      const blockerAnalyticsMap = new Map();
      let blockedCurrentCount = 0;
      let totalBlockedHours = 0;
      let resolvedBlockCount = 0;
      for (const campaign of campaigns) {
        const history = Array.isArray(campaign.blockerHistory) ? campaign.blockerHistory : [];
        if (!history.length && campaign.blockerReason) {
          history.push({
            id: 'legacy-' + campaign.id,
            type: Object.prototype.hasOwnProperty.call(BLOCKER_TYPE_DEFINITIONS, campaign.blockerType) ? campaign.blockerType : 'other',
            label: blockerTypeLabel(campaign.blockerType),
            reason: clean(campaign.blockerReason, 240),
            blockedAt: clean(campaign.blockedAt, 40),
            resolvedAt: clean(campaign.resolvedAt, 40),
            durationHours: campaign.resolvedAt && campaign.blockedAt
              ? Math.max(0, (Date.parse(campaign.resolvedAt) - Date.parse(campaign.blockedAt)) / 3600000)
              : Number.isFinite(Date.parse(campaign.blockedAt || '')) ? Math.max(0, (now - Date.parse(campaign.blockedAt)) / 3600000) : 0
          });
        }
        for (const entry of history) {
          const type = Object.prototype.hasOwnProperty.call(BLOCKER_TYPE_DEFINITIONS, entry.type) ? entry.type : 'other';
          const blockedAt = Date.parse(entry.blockedAt || '');
          const resolvedAt = Date.parse(entry.resolvedAt || '');
          const durationHours = entry.resolvedAt && Number.isFinite(blockedAt) && Number.isFinite(resolvedAt)
            ? Math.max(0, (resolvedAt - blockedAt) / 3600000)
            : Number.isFinite(blockedAt) ? Math.max(0, (now - blockedAt) / 3600000) : Math.max(0, number(entry.durationHours));
          const current = blockerAnalyticsMap.get(type) || { type, label:blockerTypeLabel(type), occurrences:0, open:0, resolved:0, totalDurationHours:0, potentialValue:0 };
          current.occurrences += 1;
          if (!entry.resolvedAt) { current.open += 1; blockedCurrentCount += 1; }
          else { current.resolved += 1; resolvedBlockCount += 1; }
          current.totalDurationHours += durationHours;
          if (entry.blockedAt && !entry.resolvedAt) {
            const related = campaigns.find(item => item === campaign);
            current.potentialValue += Math.max(0, number(related?.potentialValue));
          }
          totalBlockedHours += durationHours;
          blockerAnalyticsMap.set(type, current);
        }
      }
      const blockerAnalyticsRows = [...blockerAnalyticsMap.values()]
        .map(row => ({
          type: row.type,
          label: row.label,
          occurrences: row.occurrences,
          open: row.open,
          resolved: row.resolved,
          averageDurationHours: row.occurrences ? Math.round((row.totalDurationHours / row.occurrences) * 10) / 10 : 0,
          potentialValue: Math.round(row.potentialValue * 100) / 100
        }))
        .sort((a,b) => b.open - a.open || b.occurrences - a.occurrences || b.potentialValue - a.potentialValue);
      const blockerAnalytics = {
        openCount: blockedCurrentCount,
        resolvedCount: resolvedBlockCount,
        totalOccurrences: blockerAnalyticsRows.reduce((sum,row) => sum + row.occurrences, 0),
        averageDurationHours: blockerAnalyticsRows.reduce((sum,row) => sum + row.occurrences, 0) ? Math.round((totalBlockedHours / blockerAnalyticsRows.reduce((sum,row) => sum + row.occurrences, 0)) * 10) / 10 : 0,
        openPotentialValue: Math.round(blockerAnalyticsRows.reduce((sum,row) => sum + row.potentialValue, 0) * 100) / 100,
        rows: blockerAnalyticsRows,
        note: 'مدة الحجب محسوبة من سجل الحجب؛ العائق المفتوح يستمر احتسابه حتى وقت إنشاء الملخص. القيمة المفتوحة ليست خسارة مؤكدة.'
      };
  
      const riskTaskRows = openTaskRows.map(row => ({ ...row, risk: row.task.riskKey || 'low' }));
      const riskBuckets = {
        high: riskTaskRows.filter(row => row.risk === 'high'),
        medium: riskTaskRows.filter(row => row.risk === 'medium'),
        low: riskTaskRows.filter(row => row.risk === 'low')
      };
      const sumPotential = rows => Math.round(rows.reduce((sum, row) => sum + Math.max(0, number(row.potentialValue)), 0) * 100) / 100;
      const riskExposure = {
        high: {
          count: riskBuckets.high.length,
          potentialValue: sumPotential(riskBuckets.high)
        },
        medium: {
          count: riskBuckets.medium.length,
          potentialValue: sumPotential(riskBuckets.medium)
        },
        low: {
          count: riskBuckets.low.length,
          potentialValue: sumPotential(riskBuckets.low)
        },
        openTasks: riskTaskRows.length,
        highRiskCount: riskBuckets.high.length,
        highRiskPotentialValue: sumPotential(riskBuckets.high),
        totalPotentialValue: sumPotential(riskTaskRows),
        note: 'قيمة الفرص هنا مرتبطة بمهام ذات مخاطرة تشغيلية؛ لا تعني أن هذا الإيراد سيُفقد فعليًا.'
      };
  
      const dailyBriefing = {
        generatedAt: new Date(now).toISOString(),
        date: todayKey,
        summary: {
          urgent: briefingCandidates.filter(item => item.urgency >= 800).length,
          dueSoon: briefingCandidates.filter(item => item.urgency === 750).length,
          unassigned: openTaskRows.filter(item => !item.owner).length
        },
        items: briefingCandidates
          .sort((a,b) => b.urgency - a.urgency || (Date.parse(a.dueAt || '') || Number.MAX_SAFE_INTEGER) - (Date.parse(b.dueAt || '') || Number.MAX_SAFE_INTEGER))
          .slice(0, 8)
      };
  
      const totalDurationHours = durationRows.reduce((sum,row) => sum + row.durationHours, 0);
      const taskPerformance = {
        completed: completedTasks.length,
        slaMeasured: slaTasks.length,
        onTime: slaTasks.filter(row => row.onTime).length,
        overdueCompleted: slaTasks.filter(row => !row.onTime).length,
        onTimeRate: slaTasks.length ? Math.round((slaTasks.filter(row => row.onTime).length / slaTasks.length) * 1000) / 10 : null,
        averageCompletionHours: durationRows.length ? Math.round((totalDurationHours / durationRows.length) * 10) / 10 : null,
        byOwner
      };
  
      const valueRealizationRows = completedTasks
        .map(item => {
          const potentialValue = Math.max(0, number(item.potentialValue));
          const measuredRevenue = Math.max(0, number(item.resultRevenue));
          if (potentialValue <= 0) return null;
          const capturedPotentialValue = Math.min(measuredRevenue, potentialValue);
          const unrealizedPotentialValue = Math.max(0, potentialValue - measuredRevenue);
          return {
            item,
            potentialValue,
            measuredRevenue,
            capturedPotentialValue,
            unrealizedPotentialValue,
            converted: item.status === 'converted'
          };
        })
        .filter(Boolean);
      const valueRealizationMap = new Map();
      for (const row of valueRealizationRows) {
        const sourceType = clean(row.item.sourceType || 'revenue_opportunity', 50);
        const sourceKey = clean(row.item.sourceKey || row.item.type || row.item.reference || 'unknown', 120);
        const key = sourceType + ':' + sourceKey;
        const current = valueRealizationMap.get(key) || {
          key,
          sourceType,
          sourceKey,
          label: row.item.title || sourceKey,
          tasks: 0,
          converted: 0,
          potentialValue: 0,
          capturedPotentialValue: 0,
          measuredRevenue: 0,
          unrealizedPotentialValue: 0
        };
        current.tasks += 1;
        if (row.converted) current.converted += 1;
        current.potentialValue += row.potentialValue;
        current.capturedPotentialValue += row.capturedPotentialValue;
        current.measuredRevenue += row.measuredRevenue;
        current.unrealizedPotentialValue += row.unrealizedPotentialValue;
        valueRealizationMap.set(key, current);
      }
      const valueRealizationRowsSorted = [...valueRealizationMap.values()]
        .map(row => ({
          key: row.key,
          sourceType: row.sourceType,
          sourceKey: row.sourceKey,
          label: clean(row.label, 120),
          tasks: row.tasks,
          converted: row.converted,
          potentialValue: Math.round(row.potentialValue * 100) / 100,
          capturedPotentialValue: Math.round(row.capturedPotentialValue * 100) / 100,
          measuredRevenue: Math.round(row.measuredRevenue * 100) / 100,
          unrealizedPotentialValue: Math.round(row.unrealizedPotentialValue * 100) / 100,
          realizationRate: row.potentialValue ? Math.round((row.capturedPotentialValue / row.potentialValue) * 1000) / 10 : null
        }))
        .sort((a,b) => b.potentialValue - a.potentialValue || b.capturedPotentialValue - a.capturedPotentialValue || b.tasks - a.tasks);
      const totalPotentialValue = valueRealizationRowsSorted.reduce((sum,row) => sum + row.potentialValue, 0);
      const totalCapturedPotentialValue = valueRealizationRowsSorted.reduce((sum,row) => sum + row.capturedPotentialValue, 0);
      const totalMeasuredRevenueForPotential = valueRealizationRowsSorted.reduce((sum,row) => sum + row.measuredRevenue, 0);
      const totalUnrealizedPotentialValue = valueRealizationRowsSorted.reduce((sum,row) => sum + row.unrealizedPotentialValue, 0);
      const valueRealization = {
        measurableTasks: valueRealizationRows.length,
        convertedTasks: valueRealizationRows.filter(row => row.converted).length,
        potentialValue: Math.round(totalPotentialValue * 100) / 100,
        capturedPotentialValue: Math.round(totalCapturedPotentialValue * 100) / 100,
        measuredRevenue: Math.round(totalMeasuredRevenueForPotential * 100) / 100,
        unrealizedPotentialValue: Math.round(totalUnrealizedPotentialValue * 100) / 100,
        realizationRate: totalPotentialValue ? Math.round((totalCapturedPotentialValue / totalPotentialValue) * 1000) / 10 : null,
        rows: valueRealizationRowsSorted,
        note: 'معدل تحقق القيمة يقارن القيمة المحتملة المسجلة عند إنشاء المهمة بالقيمة المقاسة عند الإغلاق. هو مقياس تشغيلي وليس إثباتًا سببيًا؛ الإيراد المقاس قد يتجاوز قيمة الفرصة الأصلية، لذلك تُحسب نسبة التحقق على القيمة المحتملة بحد أقصى 100%.',
        coverageNote: 'المهام التي لا تحتوي على قيمة فرصة موجبة لا تدخل في هذا القياس.'
      };
  
      const outcomeReasonRows = campaigns
        .filter(item => item.status !== 'draft')
        .map(item => {
          const reasonKey = Object.prototype.hasOwnProperty.call(OUTCOME_REASON_DEFINITIONS, item.outcomeReason)
            ? item.outcomeReason
            : item.status === 'converted'
              ? (item.attribution?.matchedOrder ? 'converted_to_order' : 'manual_conversion')
              : item.status === 'executed'
                ? 'completed_no_conversion'
                : 'unclassified';
          return { item, reasonKey, reasonLabel: outcomeReasonLabel(reasonKey) };
        });
      const outcomeReasonMap = new Map();
      for (const row of outcomeReasonRows) {
        const current = outcomeReasonMap.get(row.reasonKey) || {
          key: row.reasonKey, label: row.reasonLabel, count: 0, converted: 0, executed: 0, ignored: 0, measuredRevenue: 0
        };
        current.count += 1;
        if (row.item.status === 'converted') current.converted += 1;
        if (row.item.status === 'executed') current.executed += 1;
        if (row.item.status === 'ignored') current.ignored += 1;
        current.measuredRevenue += Math.max(0, number(row.item.resultRevenue));
        outcomeReasonMap.set(row.reasonKey, current);
      }
      const outcomeReasonRowsSorted = [...outcomeReasonMap.values()]
        .map(row => ({ ...row, measuredRevenue: Math.round(row.measuredRevenue * 100) / 100 }))
        .sort((a,b) => b.count - a.count || b.measuredRevenue - a.measuredRevenue || a.label.localeCompare(b.label, 'ar'));
      const frictionKeys = new Set(['customer_unresponsive','not_interested','not_relevant','operational_issue','timing','duplicate','other','unclassified']);
      const topFriction = outcomeReasonRowsSorted.find(row => frictionKeys.has(row.key)) || null;
      const outcomeInsights = {
        totalRecorded: outcomeReasonRows.length,
        converted: outcomeReasonRows.filter(row => row.item.status === 'converted').length,
        executed: outcomeReasonRows.filter(row => row.item.status === 'executed').length,
        ignored: outcomeReasonRows.filter(row => row.item.status === 'ignored').length,
        measuredRevenue: Math.round(outcomeReasonRows.reduce((sum,row) => sum + Math.max(0, number(row.item.resultRevenue)), 0) * 100) / 100,
        topReason: outcomeReasonRowsSorted[0] || null,
        topFriction,
        byReason: outcomeReasonRowsSorted,
        note: 'الأسباب مبنية على النتائج التي يسجلها الفريق يدويًا، وهي أداة تشخيص وليست إثباتًا لسبب سببي.'
      };
  
  
      const learningMap = new Map();
      for (const row of outcomeReasonRows) {
        const sourceType = clean(row.item.sourceType || 'revenue_opportunity', 50);
        const sourceKey = clean(row.item.sourceKey || row.item.type || row.item.reference || 'unknown', 120);
        const key = sourceType + ':' + sourceKey;
        const current = learningMap.get(key) || {
          key,
          sourceType,
          sourceKey,
          label: row.item.title || sourceKey,
          total: 0,
          converted: 0,
          executed: 0,
          ignored: 0,
          measuredRevenue: 0,
          reasons: new Map()
        };
        current.total += 1;
        if (row.item.status === 'converted') current.converted += 1;
        if (row.item.status === 'executed') current.executed += 1;
        if (row.item.status === 'ignored') current.ignored += 1;
        current.measuredRevenue += Math.max(0, number(row.item.resultRevenue));
        current.reasons.set(row.reasonKey, (current.reasons.get(row.reasonKey) || 0) + 1);
        learningMap.set(key, current);
      }
      const outcomeLearningRows = [...learningMap.values()]
        .map(row => {
          const reasonEntry = [...row.reasons.entries()].sort((a,b) => b[1] - a[1])[0] || null;
          const conversionRate = row.total ? Math.round((row.converted / row.total) * 1000) / 10 : 0;
          const frictionKeys = new Set(['customer_unresponsive','not_interested','not_relevant','operational_issue','timing','duplicate','other','unclassified']);
          let learningAction = 'استمر في القياس وسجّل النتيجة مع سبب واضح.';
          if (reasonEntry && frictionKeys.has(reasonEntry[0])) {
            if (reasonEntry[0] === 'customer_unresponsive') learningAction = 'راجع توقيت وقناة التواصل، ثم أعد التجربة فقط مع وجود موافقة مناسبة.';
            else if (reasonEntry[0] === 'not_relevant') learningAction = 'راجع ملاءمة العرض مع مصدر الفرصة أو الشريحة قبل تكرار الإجراء.';
            else if (reasonEntry[0] === 'operational_issue') learningAction = 'عالج العائق التشغيلي أولًا قبل إعادة نفس الإجراء.';
            else if (reasonEntry[0] === 'timing') learningAction = 'راجع توقيت التنفيذ قبل إعادة المحاولة.';
            else if (reasonEntry[0] === 'not_interested') learningAction = 'راجع العرض والقيمة المقترحة بدل تكرار نفس الرسالة.';
            else learningAction = 'راجع السبب المتكرر قبل إعادة تنفيذ الإجراء بنفس الطريقة.';
          } else if (row.converted > 0) {
            learningAction = 'احتفظ بنفس مسار التنفيذ، وواصل ربط التحولات بطلبات فعلية عندما يكون ذلك متاحًا.';
          }
          const sampleSize = row.total;
          const signal = sampleSize >= 10
            ? { key:'strong', label:'إشارة قوية', note:'العينة 10 نتائج أو أكثر.' }
            : sampleSize >= 3
              ? { key:'medium', label:'إشارة متوسطة', note:'العينة 3 إلى 9 نتائج.' }
              : { key:'early', label:'إشارة مبكرة', note:'العينة أقل من 3 نتائج؛ لا تبنِ قرارًا كبيرًا عليها.' };
          return {
            key: row.key,
            sourceType: row.sourceType,
            sourceKey: row.sourceKey,
            label: clean(row.label, 120),
            total: row.total,
            sampleSize,
            signalKey: signal.key,
            signalLabel: signal.label,
            signalNote: signal.note,
            converted: row.converted,
            executed: row.executed,
            ignored: row.ignored,
            conversionRate,
            measuredRevenue: Math.round(row.measuredRevenue * 100) / 100,
            topReasonKey: reasonEntry?.[0] || 'unclassified',
            topReason: outcomeReasonLabel(reasonEntry?.[0] || 'unclassified'),
            topReasonCount: reasonEntry?.[1] || 0,
            learningAction
          };
        })
        .sort((a,b) => b.total - a.total || b.measuredRevenue - a.measuredRevenue || b.conversionRate - a.conversionRate);
      const outcomeLearning = {
        sourcesMeasured: outcomeLearningRows.length,
        outcomesMeasured: outcomeLearningRows.reduce((sum,row) => sum + row.total, 0),
        converted: outcomeLearningRows.reduce((sum,row) => sum + row.converted, 0),
        measuredRevenue: Math.round(outcomeLearningRows.reduce((sum,row) => sum + row.measuredRevenue, 0) * 100) / 100,
        rows: outcomeLearningRows,
        note: 'التعلم هنا مبني على نتائج الفريق المسجلة يدويًا؛ لا يثبت أن السبب وحده هو الذي أدى إلى النتيجة.'
      };
  
      return {
        counts: {
          drafts: campaigns.filter(item => item.status === 'draft').length,
          executed: campaigns.filter(item => item.status === 'executed').length,
          converted: campaigns.filter(item => item.status === 'converted').length,
          ignored: campaigns.filter(item => item.status === 'ignored').length,
          attributedOrders: campaigns.filter(item => item.status === 'converted' && item.attribution?.matchedOrder).length,
          measuredRevenue: campaigns.reduce((sum, item) => sum + number(item.resultRevenue), 0),
          openTasks: taskRows.filter(item => item.key !== 'done').length,
          assignedTasks: taskRows.filter(item => item.key === 'assigned').length,
          inProgressTasks: taskRows.filter(item => item.key === 'in_progress').length,
          overdueTasks: taskRows.filter(item => item.key === 'overdue' || item.key === 'escalated').length,
          escalatedTasks: taskRows.filter(item => item.key === 'escalated').length,
          unassignedTasks: taskRows.filter(item => item.key === 'unassigned').length,
          blockedTasks: taskRows.filter(item => item.key === 'blocked').length
        },
        recent,
        taskBoard,
        taskPerformance,
        dailyBriefing,
        taskWorkload,
        taskRouting,
        riskExposure,
        outcomeInsights,
        outcomeLearning,
        blockerAnalytics,
        valueRealization
      };
    }

  function getCampaignActivity(id) {
    const campaign = campaigns.find(item => item.id === clean(id, 40));
    if (!campaign) return null;
    return {
      id: campaign.id,
      title: campaign.title,
      activityLog: Array.isArray(campaign.activityLog) ? campaign.activityLog.slice().reverse() : []
    };
  }

  return { restoreRevenue, recordEvent, buildSummary, createCampaignDraft, executeAbandonedCartRecovery, executeInactiveCustomerRecovery, executeReturningCustomerRecovery, getRecoveryCart, recordRecoveryOrder, updateCampaignOutcome, updateCampaignTask, getCampaignActivity, campaignSummary, customer360, customerSegments, flushPersistRevenue };
}
