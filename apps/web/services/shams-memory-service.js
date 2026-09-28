import crypto from 'node:crypto';

const MEMORY_VERSION = 1;
const CUSTOMER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 16;
const MAX_RECENT_PRODUCTS = 8;
const MAX_AVOID_PRODUCTS = 8;
const MAX_LAST_RECOMMENDATIONS = 3;
const MAX_CHOSEN_PRODUCTS = 8;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const LEARNABLE_PREFERENCES = Object.freeze([
  'spicy',
  'vegetarian',
  'taste',
  'weight',
  'category',
  'protein'
]);
const STABLE_PREFERENCE_THRESHOLD = 2;

function normalizePreferenceEvidence(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    LEARNABLE_PREFERENCES.map(field => {
      const rows = Array.isArray(input[field]) ? input[field] : [];
      const normalized = rows
        .map(row => ({
          value: clean(row?.value, 80),
          count: Math.max(0, Math.min(20, Math.round(Number(row?.count || 0)))),
          lastSeenAt: clean(row?.lastSeenAt, 40)
        }))
        .filter(row => row.value && row.count > 0)
        .slice(0, 6);
      return [field, normalized];
    })
  );
}

function learnPreferences(currentPreferences, evidence, detected) {
  const nextEvidence = normalizePreferenceEvidence(evidence);
  const now = new Date().toISOString();

  for (const field of LEARNABLE_PREFERENCES) {
    if (!(field in detected) || detected[field] === null || detected[field] === undefined || detected[field] === '') continue;
    const value = String(detected[field]);
    const rows = nextEvidence[field];
    const existing = rows.find(row => row.value === value);
    if (existing) existing.count = Math.min(20, existing.count + 1);
    else rows.unshift({ value, count: 1, lastSeenAt: now });
    for (const row of rows) {
      if (row.value === value) row.lastSeenAt = now;
    }
    rows.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const currentValue = currentPreferences[field];
      const aIsCurrent = currentValue !== null && currentValue !== undefined && currentValue !== '' && String(a.value) === String(currentValue);
      const bIsCurrent = currentValue !== null && currentValue !== undefined && currentValue !== '' && String(b.value) === String(currentValue);
      if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
      return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
    });
  }

  const learned = { ...currentPreferences };
  const confidence = {};
  for (const field of LEARNABLE_PREFERENCES) {
    const top = nextEvidence[field]?.[0];
    if (!top) continue;
    confidence[field] = Math.min(1, top.count / STABLE_PREFERENCE_THRESHOLD);
    const normalizedTop = (field === 'spicy' || field === 'vegetarian')
      ? top.value === 'true'
      : top.value;
    if (currentPreferences[field] === null || currentPreferences[field] === undefined || currentPreferences[field] === '') {
      if (top.count >= STABLE_PREFERENCE_THRESHOLD) {
        learned[field] = normalizedTop;
      } else if (nextEvidence[field].length > 1) {
        const previous = nextEvidence[field][1];
        learned[field] = field === 'spicy' || field === 'vegetarian'
          ? previous.value === 'true'
          : previous.value;
      }
    } else if (
      top.count >= STABLE_PREFERENCE_THRESHOLD ||
      String(currentPreferences[field]) === String(normalizedTop)
    ) {
      learned[field] = normalizedTop;
    }
  }

  return {
    preferences: normalizePreferences(learned),
    preferenceEvidence: nextEvidence,
    preferenceConfidence: confidence
  };
}

function normalizeAvoidProducts(value) {
  const input = Array.isArray(value) ? value : [];
  return input
    .map(item => ({
      id: clean(item?.id, 50),
      nameAr: clean(item?.nameAr, 120),
      count: Math.max(1, Math.min(20, Math.round(Number(item?.count || 1)))),
      lastRejectedAt: clean(item?.lastRejectedAt, 40)
    }))
    .filter(item => item.id)
    .slice(-MAX_AVOID_PRODUCTS);
}

function normalizeChosenProducts(value) {
  const input = Array.isArray(value) ? value : [];
  return input
    .map(item => ({
      id: clean(item?.id, 50),
      nameAr: clean(item?.nameAr, 120),
      count: Math.max(1, Math.min(20, Math.round(Number(item?.count || 1)))),
      lastChosenAt: clean(item?.lastChosenAt, 40)
    }))
    .filter(item => item.id)
    .sort((a, b) => b.count - a.count || String(b.lastChosenAt).localeCompare(String(a.lastChosenAt)))
    .slice(0, MAX_CHOSEN_PRODUCTS);
}

function normalizeLastRecommendations(value) {
  const input = Array.isArray(value) ? value : [];
  return input
    .map(item => ({
      id: clean(item?.id, 50),
      nameAr: clean(item?.nameAr, 120),
      price: Number(item?.price || 0)
    }))
    .filter(item => item.id)
    .slice(0, MAX_LAST_RECOMMENDATIONS);
}

function rejectionTarget(user, recommendations) {
  if (!isExplicitProductRejection(user)) return null;
  const rows = normalizeLastRecommendations(recommendations);
  if (!rows.length) return null;
  const raw = String(user || '');
  const index =
    /(?:التالت|الثالث|تالت واحد|رقم 3)/i.test(raw) ? 2 :
    /(?:التاني|الثاني|تاني واحد|رقم 2)/i.test(raw) ? 1 : 0;
  const mentioned = rows.find(item => {
    const name = String(item.nameAr || '').trim();
    return name.length >= 2 && raw.includes(name);
  });
  return mentioned || rows[index] || rows[0];
}

function isExplicitProductRejection(value) {
  const raw = String(value || '');
  return /(?:مش|مو|لا|لأ|لاا).{0,16}(?:ده|دي|دا|هيدا|هيدي|هالطبق|الطبق ده|الطبق دي)|(?:مش عاجبني|مش عاجبني ده|مش بحبه|مش حابه|مو عاجبني|مو بحبه|مو حابب|مو حابه|مش عايز ده|مش عاوز ده|مش ده|مش دي|مو هيدا|مو هيدي)/i.test(raw);
}

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
    preferenceEvidence: normalizePreferenceEvidence(source.preferenceEvidence),
    avoidProducts: normalizeAvoidProducts(source.avoidProducts),
    lastRecommendation: normalizeLastRecommendations(source.lastRecommendation),
    chosenProducts: normalizeChosenProducts(source.chosenProducts),
    preferenceConfidence: source.preferenceConfidence && typeof source.preferenceConfidence === 'object'
      ? Object.fromEntries(Object.entries(source.preferenceConfidence).slice(0, 12).map(([key, value]) => [clean(key, 40), Math.max(0, Math.min(1, Number(value) || 0))]))
      : {},
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
    const preferenceEvidence = normalizePreferenceEvidence(patch.preferenceEvidence ?? current.preferenceEvidence);
    const preferenceConfidence = patch.preferenceConfidence && typeof patch.preferenceConfidence === 'object'
      ? patch.preferenceConfidence
      : current.preferenceConfidence;
    const avoidProducts = normalizeAvoidProducts(patch.avoidProducts ?? current.avoidProducts);
    const lastRecommendation = normalizeLastRecommendations(patch.lastRecommendation ?? current.lastRecommendation);
    const chosenProducts = normalizeChosenProducts(patch.chosenProducts ?? current.chosenProducts);
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
      preferenceEvidence,
      preferenceConfidence,
      avoidProducts,
      lastRecommendation,
      chosenProducts,
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
    const mergedEvidence = normalizePreferenceEvidence(customerMemory.preferenceEvidence);
    const sessionEvidence = normalizePreferenceEvidence(sessionMemory.preferenceEvidence);
    for (const field of LEARNABLE_PREFERENCES) {
      for (const row of sessionEvidence[field]) {
        const current = mergedEvidence[field].find(item => item.value === row.value);
        if (current) current.count = Math.min(20, current.count + row.count);
        else mergedEvidence[field].push({ ...row });
      }
      mergedEvidence[field].sort((a, b) => b.count - a.count || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
      mergedEvidence[field] = mergedEvidence[field].slice(0, 6);
    }
    const stable = learnPreferences(mergedPreferences, mergedEvidence, {});
    const mergedAvoidProducts = normalizeAvoidProducts([
      ...customerMemory.avoidProducts,
      ...sessionMemory.avoidProducts
    ].sort((a, b) => b.count - a.count || String(b.lastRejectedAt).localeCompare(String(a.lastRejectedAt)))).slice(0, MAX_AVOID_PRODUCTS);
    const mergedChosenProducts = normalizeChosenProducts([
      ...customerMemory.chosenProducts,
      ...sessionMemory.chosenProducts
    ]);
    const mergedLastRecommendation =
      sessionMemory.updatedAt > customerMemory.updatedAt
        ? sessionMemory.lastRecommendation
        : customerMemory.lastRecommendation;
    const mergedJourney = customerMemory.journey?.stage
      ? customerMemory.journey
      : sessionMemory.journey;

    const saved = await save({ customerId: customer }, {
      preferences: stable.preferences,
      preferenceEvidence: mergedEvidence,
      preferenceConfidence: stable.preferenceConfidence,
      avoidProducts: mergedAvoidProducts,
      lastRecommendation: mergedLastRecommendation,
      chosenProducts: mergedChosenProducts,
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

  async function rememberTurn(identity, { user, assistant, intent, products, journey, name, recommendedProducts, chosenProducts: chosenProductsInput } = {}) {
    const current = await read(identity);
    const detectedPreferences = detectPreferences(user);
    const learned = learnPreferences(current.preferences, current.preferenceEvidence, detectedPreferences);
    const preferences = learned.preferences;
    const recommendationRows = normalizeLastRecommendations(recommendedProducts ?? current.lastRecommendation);
    let chosenProducts = normalizeChosenProducts(current.chosenProducts);
    const chosenRows = Array.isArray(chosenProductsInput) ? chosenProductsInput : [];
    for (const item of chosenRows) {
      if (!item?.id) continue;
      const existing = chosenProducts.find(row => row.id === String(item.id));
      if (existing) {
        existing.count = Math.min(20, existing.count + 1);
        existing.lastChosenAt = new Date().toISOString();
      } else {
        chosenProducts.push({
          id: String(item.id),
          nameAr: clean(item.nameAr, 120),
          count: 1,
          lastChosenAt: new Date().toISOString()
        });
      }
    }
    chosenProducts = normalizeChosenProducts(chosenProducts);
    let avoidProducts = current.avoidProducts;
    const rejectedProduct = rejectionTarget(user, recommendationRows) ||
      (isExplicitProductRejection(user) && Array.isArray(current.recentProducts) ? current.recentProducts.at(-1) : null);
    if (rejectedProduct?.id) {
      const existing = normalizeAvoidProducts(avoidProducts).find(item => item.id === String(rejectedProduct.id));
      if (existing) {
        existing.count = Math.min(20, existing.count + 1);
        existing.lastRejectedAt = new Date().toISOString();
      } else {
        avoidProducts = [...normalizeAvoidProducts(avoidProducts), {
          id: String(rejectedProduct.id),
          nameAr: clean(rejectedProduct.nameAr, 120),
          count: 1,
          lastRejectedAt: new Date().toISOString()
        }];
      }
      avoidProducts = normalizeAvoidProducts(avoidProducts);
    }
    const recentTurns = [
      ...current.recentTurns,
      ...(user ? [{ role: 'user', content: redactForMemory(user, 700) }] : []),
      ...(assistant ? [{ role: 'assistant', content: redactForMemory(assistant, 700) }] : [])
    ].slice(-MAX_TURNS);

    return save(identity, {
      name: name || current.name,
      preferences,
      preferenceEvidence: learned.preferenceEvidence,
      preferenceConfidence: learned.preferenceConfidence,
      avoidProducts,
      lastRecommendation: recommendationRows,
      chosenProducts,
      recentTurns,
      recentProducts: Array.isArray(products) ? products.slice(-MAX_RECENT_PRODUCTS) : current.recentProducts,
      lastIntent: intent || current.lastIntent,
      journey: journey || current.journey
    });
  }

  return { read, save, rememberTurn, mergeSessionIntoCustomer, detectPreferences, learnPreferences, isExplicitProductRejection, rejectionTarget };
}
