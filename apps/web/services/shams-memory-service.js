import crypto from 'node:crypto';

const MEMORY_VERSION = 1;
const CUSTOMER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 16;
const MAX_RECENT_PRODUCTS = 8;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

function redactForMemory(value, max = 700) {
  return clean(value, max)
    .replace(/(?:05\d{8}|9715\d{8}|\+\d[\d\s-]{7,16})/g, '[رقم هاتف مخفي]')
    .replace(/\b\d{13,19}\b/g, '[رقم مالي مخفي]');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    budgetAed: Number.isFinite(Number(input.budgetAed)) && Number(input.budgetAed) > 0
      ? Math.min(5000, Number(input.budgetAed))
      : null,
    spicy: typeof input.spicy === 'boolean' ? input.spicy : null,
    vegetarian: typeof input.vegetarian === 'boolean' ? input.vegetarian : null,
    taste: ['sweet','savory'].includes(input.taste) ? input.taste : null,
    weight: ['light','hearty'].includes(input.weight) ? input.weight : null,
    category: clean(input.category, 40),
    protein: ['chicken','beef','seafood'].includes(input.protein) ? input.protein : null,
    favoriteCategories: Array.isArray(input.favoriteCategories)
      ? input.favoriteCategories.map(item => clean(item, 80)).filter(Boolean).slice(0, 8)
      : [],
    favoriteProducts: Array.isArray(input.favoriteProducts)
      ? input.favoriteProducts.map(item => clean(item, 120)).filter(Boolean).slice(0, 8)
      : []
  };
}

function normalizeMemory(raw, identity) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const now = Date.now();
  const customerScoped = identity.kind === 'customer';
  return {
    version: MEMORY_VERSION,
    scope: identity.kind,
    customerId: customerScoped ? identity.id : '',
    sessionId: customerScoped ? '' : clean(identity.id, 120),
    name: clean(source.name, 80),
    preferences: normalizePreferences(source.preferences),
    recentTurns: Array.isArray(source.recentTurns)
      ? source.recentTurns
          .slice(-MAX_TURNS)
          .map(turn => ({
            role: turn?.role === 'assistant' ? 'assistant' : 'user',
            content: redactForMemory(turn?.content, 700)
          }))
          .filter(turn => turn.content)
      : [],
    recentProducts: Array.isArray(source.recentProducts)
      ? source.recentProducts
          .slice(-MAX_RECENT_PRODUCTS)
          .map(item => ({
            id: clean(item?.id, 50),
            nameAr: clean(item?.nameAr, 120),
            price: Number(item?.price || 0)
          }))
          .filter(item => item.id)
      : [],
    lastIntent: clean(source.lastIntent, 60),
    pendingAction: source.pendingAction && typeof source.pendingAction === 'object' ? {
      type: clean(source.pendingAction.type, 40),
      data: source.pendingAction.data && typeof source.pendingAction.data === 'object' ? source.pendingAction.data : {},
      idempotencyKey: clean(source.pendingAction.idempotencyKey, 100),
      createdAt: clean(source.pendingAction.createdAt, 40),
      expiresAt: Number(source.pendingAction.expiresAt || 0) || 0
    } : null,
    journey: {
      stage: clean(source.journey?.stage, 50),
      nextBestAction: clean(source.journey?.nextBestAction, 60),
      intent: clean(source.journey?.intent, 60),
      step: clean(source.journey?.step, 60),
      slots: source.journey?.slots && typeof source.journey.slots === 'object'
        ? Object.fromEntries(Object.entries(source.journey.slots).slice(0, 12).map(([key, value]) => [clean(key, 40), clean(value, 120)]))
        : {}
    },
    migratedToCustomerId: clean(source.migratedToCustomerId, 120),
    migratedAt: clean(source.migratedAt, 40),
    updatedAt: clean(source.updatedAt, 40),
    expiresAt: Number(source.expiresAt || 0) || (now + (customerScoped ? CUSTOMER_TTL_MS : SESSION_TTL_MS))
  };
}

function detectPreferences(text) {
  const raw = String(text || '');
  const preferences = {};
  const budget = raw.match(/(?:حدي|ميزانيتي|ميزانيه|budget|under)\s*(?:هو|هي|لحد|حتى)?\s*(\d{2,4})|\b(\d{2,4})\s*(?:درهم|AED|د)\b/i);
  const budgetValue = Number(budget?.[1] || budget?.[2] || 0);
  if (budgetValue > 0) preferences.budgetAed = budgetValue;
  if (/(حار|حارة|سبايسي|spicy)/i.test(raw)) preferences.spicy = true;
  if (/(مو حار|مش حار|بدون حار|غير حار|not spicy)/i.test(raw)) preferences.spicy = false;
  if (/(نباتي|نباتية|vegetarian|vegan)/i.test(raw)) preferences.vegetarian = true;
  if (/(حلو|حلويات|تحلية|ديسرت|dessert|شوكولاته)/i.test(raw)) preferences.taste = 'sweet';
  else if (/(مالح|حادق)/i.test(raw)) preferences.taste = 'savory';
  if (/(خفيف|خفيفه|خفيفا|light)/i.test(raw)) preferences.weight = 'light';
  else if (/(مشبع|دسم|تقيل|ثقيل|وجبه كامله)/i.test(raw)) preferences.weight = 'hearty';
  if (/(مشروب|مشروبات|شراب|عصير|قهوه|قهوة|شاي|لاتيه|كوفي|drink)/i.test(raw)) preferences.category = 'drink';
  if (/(دجاج|فراخ|chicken)/i.test(raw)) preferences.protein = 'chicken';
  else if (/(لحمه|لحمة|لحم|ستيك|beef|meat)/i.test(raw)) preferences.protein = 'beef';
  else if (/(سمك|بحري|جمبري|روبيان|seafood|fish|shrimp)/i.test(raw)) preferences.protein = 'seafood';
  return preferences;
}

export function createShamsMemoryService({ readJsonWithStatus, writeJson }) {
  const keyFor = (identity) => {
    if (identity?.customerId) return 'data/shams-memory-v1/customer/' + hash(identity.customerId);
    const sessionId = clean(identity?.sessionId, 120);
    return sessionId ? 'data/shams-memory-v1/session/' + hash(sessionId) : '';
  };

  async function read(identity) {
    const normalizedIdentity = identity?.customerId
      ? { kind: 'customer', id: clean(identity.customerId, 120) }
      : { kind: 'session', id: clean(identity?.sessionId, 120) };
    const key = keyFor({ customerId: normalizedIdentity.kind === 'customer' ? normalizedIdentity.id : '', sessionId: normalizedIdentity.kind === 'session' ? normalizedIdentity.id : '' });
    if (!key) return normalizeMemory({}, normalizedIdentity);

    try {
      const result = await readJsonWithStatus(key);
      if (!result?.ok || !result?.found) return normalizeMemory({}, normalizedIdentity);
      const memory = normalizeMemory(result.value, normalizedIdentity);
      if (memory.expiresAt < Date.now()) return normalizeMemory({}, normalizedIdentity);
      return memory;
    } catch {
      return normalizeMemory({}, normalizedIdentity);
    }
  }

  async function save(identity, patch = {}) {
    const normalizedIdentity = identity?.customerId
      ? { kind: 'customer', id: clean(identity.customerId, 120) }
      : { kind: 'session', id: clean(identity?.sessionId, 120) };
    const key = keyFor({ customerId: normalizedIdentity.kind === 'customer' ? normalizedIdentity.id : '', sessionId: normalizedIdentity.kind === 'session' ? normalizedIdentity.id : '' });
    if (!key) return false;

    const current = await read(normalizedIdentity);
    const preferences = normalizePreferences({ ...current.preferences, ...(patch.preferences || {}) });
    const recentProducts = Array.isArray(patch.recentProducts)
      ? patch.recentProducts.slice(-MAX_RECENT_PRODUCTS)
      : current.recentProducts;
    const now = new Date().toISOString();
    const expiresAt = Date.now() + (normalizedIdentity.kind === 'customer' ? CUSTOMER_TTL_MS : SESSION_TTL_MS);

    const next = {
      ...current,
      ...patch,
      version: MEMORY_VERSION,
      scope: normalizedIdentity.kind,
      customerId: normalizedIdentity.kind === 'customer' ? normalizedIdentity.id : '',
      sessionId: normalizedIdentity.kind === 'session' ? normalizedIdentity.id : '',
      name: clean(patch.name ?? current.name, 80),
      preferences,
      recentProducts,
      recentTurns: Array.isArray(patch.recentTurns) ? patch.recentTurns.slice(-MAX_TURNS) : current.recentTurns,
      lastIntent: clean(patch.lastIntent ?? current.lastIntent, 60),
      pendingAction: patch.pendingAction !== undefined ? patch.pendingAction : current.pendingAction,
      journey: patch.journey && typeof patch.journey === 'object' ? patch.journey : current.journey,
      updatedAt: now,
      expiresAt
    };
    return writeJson(key, next);
  }

  async function mergeSessionIntoCustomer(sessionId, customerId) {
    const session = clean(sessionId, 120);
    const customer = clean(customerId, 120);
    if (!session || !customer) return false;
    const sessionMemory = await read({ sessionId: session });
    if (sessionMemory.migratedToCustomerId === customer) return true;
    const customerMemory = await read({ customerId: customer });
    const mergedTurns = [...customerMemory.recentTurns, ...sessionMemory.recentTurns].slice(-MAX_TURNS);
    const mergedProducts = [...customerMemory.recentProducts, ...sessionMemory.recentProducts]
      .filter(item => item?.id)
      .slice(-MAX_RECENT_PRODUCTS);
    const mergedPreferences = normalizePreferences({
      ...customerMemory.preferences,
      ...sessionMemory.preferences
    });
    const mergedJourney = customerMemory.journey?.stage
      ? customerMemory.journey
      : sessionMemory.journey;

    const saved = await save({ customerId: customer }, {
      preferences: mergedPreferences,
      recentTurns: mergedTurns,
      recentProducts: mergedProducts,
      journey: mergedJourney,
      name: customerMemory.name || sessionMemory.name,
      pendingAction: customerMemory.pendingAction
    });
    if (!saved) return false;
    await save({ sessionId: session }, {
      migratedToCustomerId: customer,
      migratedAt: new Date().toISOString()
    });
    return true;
  }

  async function rememberTurn(identity, { user, assistant, intent, products, journey, name } = {}) {
    const current = await read(identity);
    const preferences = { ...current.preferences, ...detectPreferences(user) };
    const recentTurns = [
      ...current.recentTurns,
      ...(user ? [{ role: 'user', content: redactForMemory(user, 700) }] : []),
      ...(assistant ? [{ role: 'assistant', content: redactForMemory(assistant, 700) }] : [])
    ].slice(-MAX_TURNS);

    return save(identity, {
      name: name || current.name,
      preferences,
      recentTurns,
      recentProducts: Array.isArray(products) ? products.slice(-MAX_RECENT_PRODUCTS) : current.recentProducts,
      lastIntent: intent || current.lastIntent,
      journey: journey || current.journey
    });
  }

  return { read, save, rememberTurn, mergeSessionIntoCustomer, detectPreferences };
}
