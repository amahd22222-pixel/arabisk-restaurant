import crypto from 'node:crypto';

const PROMOTION_STATE_KEY = 'data/arabisk-promotions-v1.json';
const MAX_CLAIMS = 5000;

class PromotionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PromotionError';
    this.status = status;
  }
}

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const roundMoney = value => Math.round(Number(value) * 100) / 100;
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createDefaultTodayOffer = () => ({
  enabled: false,
  productId: '',
  badge: 'عرض اليوم',
  title: 'اختيار اليوم من ARABISK',
  message: 'اختيار مميز من القائمة متاح اليوم.',
  ctaLabel: 'اطلب الآن',
  startsAt: '',
  endsAt: '',
  updatedAt: new Date().toISOString()
});

const createDefaultInstallOffer = () => ({
  enabled: true,
  discountType: 'percent',
  discountValue: 10,
  minOrderValue: 0,
  maxDiscount: 50,
  claimValidityDays: 14,
  title: 'ثبّت ARABISK واحصل على خصم 10%',
  message: 'ثبّت ARABISK على شاشتك الرئيسية وخذ خصمك على أول طلب باستخدام الكود الشخصي.',
  updatedAt: new Date().toISOString(),
  claims: []
});

export function createPromotionService({ readJsonWithStatus, writeJson, storageReady }) {
  let todayOffer = createDefaultTodayOffer();
  let installOffer = createDefaultInstallOffer();
  let lastPersistAt = null;
  let lastPersistOk = storageReady ? null : true;

  const snapshot = () => ({
    version: 2,
    today: {
      enabled: todayOffer.enabled,
      productId: todayOffer.productId,
      badge: todayOffer.badge,
      title: todayOffer.title,
      message: todayOffer.message,
      ctaLabel: todayOffer.ctaLabel,
      startsAt: todayOffer.startsAt,
      endsAt: todayOffer.endsAt,
      updatedAt: todayOffer.updatedAt
    },
    install: {
      enabled: installOffer.enabled,
      discountType: installOffer.discountType,
      discountValue: installOffer.discountValue,
      minOrderValue: installOffer.minOrderValue,
      maxDiscount: installOffer.maxDiscount,
      claimValidityDays: installOffer.claimValidityDays,
      title: installOffer.title,
      message: installOffer.message,
      updatedAt: installOffer.updatedAt,
      claims: installOffer.claims.slice(-MAX_CLAIMS)
    }
  });

  const persistSnapshot = async () => {
    if (!storageReady) return true;
    try {
      const ok = await writeJson(PROMOTION_STATE_KEY, snapshot());
      lastPersistOk = ok !== false;
      lastPersistAt = new Date().toISOString();
      return ok !== false;
    } catch {
      lastPersistOk = false;
      lastPersistAt = new Date().toISOString();
      return false;
    }
  };

  const prune = () => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    installOffer.claims = installOffer.claims.filter(claim => {
      const timestamp = Date.parse(claim.redeemedAt || claim.expiresAt || claim.claimedAt || '');
      return !Number.isFinite(timestamp) || timestamp >= cutoff;
    }).slice(-MAX_CLAIMS);
  };

  async function restore() {
    todayOffer = createDefaultTodayOffer();
    installOffer = createDefaultInstallOffer();
    if (!storageReady) return;
    const result = await readJsonWithStatus(PROMOTION_STATE_KEY);
    if (!result.ok) {
      lastPersistOk = false;
      throw new PromotionError('Promotion state could not be restored from storage.', 503);
    }
    if (result.found && result.value && typeof result.value === 'object') {
      const savedToday = result.value.today || {};
      todayOffer = { ...createDefaultTodayOffer(), ...savedToday };
      const saved = result.value.install || {};
      installOffer = {
        ...createDefaultInstallOffer(),
        ...saved,
        claims: Array.isArray(saved.claims) ? saved.claims : []
      };
    }
    prune();
    if (result.found) await persistSnapshot();
  }

  function getPublicTodayOffer() {
    const now = Date.now();
    const startsAt = Date.parse(todayOffer.startsAt || '');
    const endsAt = Date.parse(todayOffer.endsAt || '');
    const active = todayOffer.enabled === true &&
      (!Number.isFinite(startsAt) || startsAt <= now) &&
      (!Number.isFinite(endsAt) || endsAt > now);
    return {
      enabled: active,
      productId: clean(todayOffer.productId, 50),
      badge: clean(todayOffer.badge, 80),
      title: clean(todayOffer.title, 160),
      message: clean(todayOffer.message, 320),
      ctaLabel: clean(todayOffer.ctaLabel, 60) || 'اطلب الآن',
      startsAt: todayOffer.startsAt || '',
      endsAt: todayOffer.endsAt || ''
    };
  }

  function getAdminTodayOffer() {
    return {
      ...getPublicTodayOffer(),
      configuredEnabled: todayOffer.enabled === true,
      updatedAt: todayOffer.updatedAt
    };
  }

  async function updateTodayOffer(body = {}) {
    const startsAt = clean(body.startsAt === undefined ? todayOffer.startsAt : body.startsAt, 40);
    const endsAt = clean(body.endsAt === undefined ? todayOffer.endsAt : body.endsAt, 40);
    if (startsAt && !Number.isFinite(Date.parse(startsAt))) throw new PromotionError('وقت بداية عرض اليوم غير صالح.');
    if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new PromotionError('وقت نهاية عرض اليوم غير صالح.');
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new PromotionError('وقت نهاية عرض اليوم يجب أن يكون بعد وقت البداية.');
    }

    todayOffer = {
      ...todayOffer,
      enabled: body.enabled === undefined ? todayOffer.enabled : body.enabled === true,
      productId: clean(body.productId === undefined ? todayOffer.productId : body.productId, 50),
      badge: clean(body.badge === undefined ? todayOffer.badge : body.badge, 80) || 'عرض اليوم',
      title: clean(body.title === undefined ? todayOffer.title : body.title, 160) || 'اختيار اليوم من ARABISK',
      message: clean(body.message === undefined ? todayOffer.message : body.message, 320) || 'اختيار مميز من القائمة متاح اليوم.',
      ctaLabel: clean(body.ctaLabel === undefined ? todayOffer.ctaLabel : body.ctaLabel, 60) || 'اطلب الآن',
      startsAt,
      endsAt,
      updatedAt: new Date().toISOString()
    };

    if (!(await persistSnapshot())) throw new PromotionError('تعذر حفظ عرض اليوم.', 503);
    return getAdminTodayOffer();
  }

  function getPublicInstallOffer() {
    return {
      enabled: installOffer.enabled === true,
      discountType: 'percent',
      discountValue: Number(installOffer.discountValue || 0),
      minOrderValue: Number(installOffer.minOrderValue || 0),
      maxDiscount: Number(installOffer.maxDiscount || 0),
      title: clean(installOffer.title, 160),
      message: clean(installOffer.message, 320)
    };
  }

  function getAdminInstallOffer() {
    prune();
    const claims = installOffer.claims;
    const now = Date.now();
    const active = claims.filter(claim => claim.status === 'available' && Date.parse(claim.expiresAt || '') > now).length;
    const reserved = claims.filter(claim => claim.status === 'reserved').length;
    const redeemed = claims.filter(claim => claim.status === 'redeemed').length;
    return {
      ...getPublicInstallOffer(),
      claimValidityDays: Number(installOffer.claimValidityDays || 14),
      updatedAt: installOffer.updatedAt,
      stats: { totalClaims: claims.length, active, reserved, redeemed }
    };
  }

  async function updateInstallOffer(body = {}) {
    const next = {
      enabled: body.enabled === undefined ? installOffer.enabled : body.enabled === true,
      discountType: 'percent',
      discountValue: Math.min(100, Math.max(1, Math.round(number(body.discountValue, installOffer.discountValue)))),
      minOrderValue: Math.max(0, roundMoney(number(body.minOrderValue, installOffer.minOrderValue))),
      maxDiscount: Math.max(0, roundMoney(number(body.maxDiscount, installOffer.maxDiscount))),
      claimValidityDays: Math.min(90, Math.max(1, Math.round(number(body.claimValidityDays, installOffer.claimValidityDays)))),
      title: clean(body.title === undefined ? installOffer.title : body.title, 160) || 'ثبّت ARABISK واحصل على خصم',
      message: clean(body.message === undefined ? installOffer.message : body.message, 320) || 'ثبّت ARABISK على شاشتك الرئيسية وخذ خصمك على أول طلب باستخدام الكود الشخصي.'
    };
    installOffer = { ...installOffer, ...next, updatedAt: new Date().toISOString() };
    prune();
    if (!(await persistSnapshot())) throw new PromotionError('تعذر حفظ إعدادات العرض.', 503);
    return getAdminInstallOffer();
  }

  function findClaim(code) {
    const normalized = clean(code, 80).toUpperCase();
    return installOffer.claims.find(claim => claim.code === normalized) || null;
  }

  const calculate = (claim, subtotal) => {
    if (!installOffer.enabled) throw new PromotionError('Install promotion is currently disabled.', 409);
    if (!claim) throw new PromotionError('Invalid or expired promotion code.', 400);
    if (claim.status !== 'available') throw new PromotionError('Promotion code has already been used.', 409);
    if (Date.parse(claim.expiresAt || '') <= Date.now()) throw new PromotionError('Promotion code has expired.', 410);

    const value = Math.max(0, roundMoney(subtotal));
    const minOrderValue = Math.max(0, number(installOffer.minOrderValue));
    if (value < minOrderValue) throw new PromotionError('Order value does not meet the minimum for this promotion.', 400);

    let discount = roundMoney(value * (number(installOffer.discountValue) / 100));
    const maxDiscount = number(installOffer.maxDiscount);
    if (maxDiscount > 0) discount = Math.min(discount, maxDiscount);
    discount = Math.min(discount, value);

    return {
      code: claim.code,
      discount: roundMoney(discount),
      subtotal: value,
      total: roundMoney(value - discount),
      discountType: 'percent',
      discountValue: number(installOffer.discountValue),
      maxDiscount
    };
  };

  function quoteInstallReward(code, subtotal) {
    prune();
    return calculate(findClaim(code), subtotal);
  }

  async function claimInstallReward(clientId) {
    if (!installOffer.enabled) throw new PromotionError('Install promotion is currently disabled.', 409);
    prune();
    const normalizedClientId = clean(clientId, 100);

    if (normalizedClientId) {
      const existing = [...installOffer.claims].reverse().find(claim =>
        claim.clientId === normalizedClientId &&
        ['available', 'reserved'].includes(claim.status) &&
        Date.parse(claim.expiresAt || '') > Date.now()
      );
      if (existing) {
        return {
          code: existing.code,
          expiresAt: existing.expiresAt,
          discountType: 'percent',
          discountValue: Number(installOffer.discountValue),
          maxDiscount: Number(installOffer.maxDiscount)
        };
      }
    }

    const claimedAt = new Date();
    const code = 'ARAB-PWA-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const expiresAt = new Date(claimedAt.getTime() + Number(installOffer.claimValidityDays || 14) * 86400000).toISOString();
    const claim = {
      id: crypto.randomUUID(),
      code,
      clientId: normalizedClientId,
      status: 'available',
      claimedAt: claimedAt.toISOString(),
      expiresAt
    };

    installOffer.claims.push(claim);
    prune();
    if (!(await persistSnapshot())) {
      installOffer.claims = installOffer.claims.filter(item => item.id !== claim.id);
      throw new PromotionError('تعذر إصدار كود الخصم حاليًا.', 503);
    }

    return {
      code,
      expiresAt,
      discountType: 'percent',
      discountValue: Number(installOffer.discountValue),
      maxDiscount: Number(installOffer.maxDiscount)
    };
  }

  async function reserveInstallReward(code, subtotal, orderId) {
    prune();
    const claim = findClaim(code);
    const quote = calculate(claim, subtotal);
    claim.status = 'reserved';
    claim.reservedAt = new Date().toISOString();
    claim.reservedOrderId = clean(orderId, 40);

    if (!(await persistSnapshot())) {
      claim.status = 'available';
      delete claim.reservedAt;
      delete claim.reservedOrderId;
      throw new PromotionError('تعذر تثبيت الخصم للطلب. حاول مرة أخرى.', 503);
    }

    return { claimId: claim.id, code: quote.code, discount: quote.discount, subtotal: quote.subtotal, total: quote.total };
  }

  async function rollbackReservation(reservation) {
    const claim = installOffer.claims.find(item => item.id === reservation?.claimId);
    if (!claim || claim.status !== 'reserved') return true;
    claim.status = 'available';
    delete claim.reservedAt;
    delete claim.reservedOrderId;
    return persistSnapshot();
  }

  async function commitReservation(reservation) {
    const claim = installOffer.claims.find(item => item.id === reservation?.claimId);
    if (!claim || claim.status !== 'reserved') return false;
    claim.status = 'redeemed';
    claim.redeemedAt = new Date().toISOString();
    delete claim.reservedAt;
    delete claim.reservedOrderId;
    await persistSnapshot();
    return true;
  }

  return {
    restore,
    getPublicTodayOffer,
    getAdminTodayOffer,
    updateTodayOffer,
    getPublicInstallOffer,
    getAdminInstallOffer,
    updateInstallOffer,
    claimInstallReward,
    quoteInstallReward,
    reserveInstallReward,
    rollbackReservation,
    commitReservation,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: persistSnapshot
  };
}
