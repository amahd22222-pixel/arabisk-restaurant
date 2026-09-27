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
const validDate = value => Number.isFinite(Date.parse(String(value || '')));

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

const createDefaultTodayOffer = () => ({
  enabled: false,
  badge: 'عرض اليوم',
  title: 'اختيار اليوم من ARABISK',
  message: 'عرض خاص متاح اليوم لفترة محدودة.',
  productId: '',
  startsAt: '',
  endsAt: '',
  ctaLabel: 'اطلب الآن',
  updatedAt: new Date().toISOString()
});

export function createPromotionService({ readJsonWithStatus, writeJson, storageReady }) {
  let installOffer = createDefaultInstallOffer();
  let todayOffer = createDefaultTodayOffer();
  let lastPersistAt = null;
  let lastPersistOk = storageReady ? null : true;

  const snapshot = () => ({
    version: 2,
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
    },
    today: {
      enabled: todayOffer.enabled,
      badge: todayOffer.badge,
      title: todayOffer.title,
      message: todayOffer.message,
      productId: todayOffer.productId,
      startsAt: todayOffer.startsAt,
      endsAt: todayOffer.endsAt,
      ctaLabel: todayOffer.ctaLabel,
      updatedAt: todayOffer.updatedAt
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
    installOffer = createDefaultInstallOffer();
    todayOffer = createDefaultTodayOffer();
    if (!storageReady) return;

    const result = await readJsonWithStatus(PROMOTION_STATE_KEY);
    if (!result.ok) {
      lastPersistOk = false;
      throw new PromotionError('Promotion state could not be restored from storage.', 503);
    }

    if (result.found && result.value && typeof result.value === 'object') {
      const savedInstall = result.value.install || {};
      const savedToday = result.value.today || {};
      installOffer = {
        ...createDefaultInstallOffer(),
        ...savedInstall,
        claims: Array.isArray(savedInstall.claims) ? savedInstall.claims : []
      };
      todayOffer = {
        ...createDefaultTodayOffer(),
        ...savedToday
      };
    }

    prune();
    if (result.found) await persistSnapshot();
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

  function isTodayOfferLive() {
    if (todayOffer.enabled !== true) return false;
    const now = Date.now();
    const startsAt = Date.parse(todayOffer.startsAt || '');
    const endsAt = Date.parse(todayOffer.endsAt || '');
    if (Number.isFinite(startsAt) && now < startsAt) return false;
    if (Number.isFinite(endsAt) && now >= endsAt) return false;
    return true;
  }

  function getPublicTodayOffer() {
    if (!isTodayOfferLive()) return { enabled: false };
    return {
      enabled: true,
      badge: clean(todayOffer.badge, 60) || 'عرض اليوم',
      title: clean(todayOffer.title, 160) || 'عرض اليوم',
      message: clean(todayOffer.message, 320) || 'عرض خاص من ARABISK متاح اليوم.',
      productId: clean(todayOffer.productId, 60),
      startsAt: todayOffer.startsAt || '',
      endsAt: todayOffer.endsAt || '',
      ctaLabel: clean(todayOffer.ctaLabel, 60) || 'اطلب الآن'
    };
  }

  function getAdminTodayOffer() {
    return {
      ...todayOffer,
      enabled: todayOffer.enabled === true,
      live: isTodayOfferLive()
    };
  }

  async function updateTodayOffer(body = {}) {
    const startsAt = clean(body.startsAt === undefined ? todayOffer.startsAt : body.startsAt, 40);
    const endsAt = clean(body.endsAt === undefined ? todayOffer.endsAt : body.endsAt, 40);
    if (startsAt && !validDate(startsAt)) throw new PromotionError('بداية العرض يجب أن تكون تاريخًا صالحًا.');
    if (endsAt && !validDate(endsAt)) throw new PromotionError('نهاية العرض يجب أن تكون تاريخًا صالحًا.');
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new PromotionError('نهاية العرض يجب أن تكون بعد البداية.');
    }

    todayOffer = {
      ...todayOffer,
      enabled: body.enabled === undefined ? todayOffer.enabled : body.enabled === true,
      badge: clean(body.badge === undefined ? todayOffer.badge : body.badge, 60) || 'عرض اليوم',
      title: clean(body.title === undefined ? todayOffer.title : body.title, 160) || 'عرض اليوم',
      message: clean(body.message === undefined ? todayOffer.message : body.message, 320) || 'عرض خاص من ARABISK متاح اليوم.',
      productId: clean(body.productId === undefined ? todayOffer.productId : body.productId, 60),
      startsAt,
      endsAt,
      ctaLabel: clean(body.ctaLabel === undefined ? todayOffer.ctaLabel : body.ctaLabel, 60) || 'اطلب الآن',
      updatedAt: new Date().toISOString()
    };

    if (!(await persistSnapshot())) throw new PromotionError('تعذر حفظ عرض اليوم.', 503);
    return getAdminTodayOffer();
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
    getPublicInstallOffer,
    getAdminInstallOffer,
    updateInstallOffer,
    claimInstallReward,
    quoteInstallReward,
    reserveInstallReward,
    rollbackReservation,
    commitReservation,
    getPublicTodayOffer,
    getAdminTodayOffer,
    updateTodayOffer,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: persistSnapshot
  };
}