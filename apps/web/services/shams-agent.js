import { getUaeTimeContext } from '../utils/uae-time.js';
import { buildSmartLocalPlan, isNegatedAction } from './shams-local-intelligence.js';

const MAX_TOOL_CALLS = 4;
const ALLOWED_PATHS = new Set(['/', '/menu', '/reservation', '/cart', '/track-order', '/events', '/memories', '/privacy']);
const ALLOWED_TOOLS = new Set([
  'search_menu',
  'recommend_menu',
  'product_info',
  'cart_summary',
  'cart_add',
  'navigate',
  'get_order_status'
]);
const STAGES = Object.freeze([
  'understand',
  'recall',
  'plan',
  'execute',
  'verify',
  'respond',
  'learn'
]);

const clean = (value, max = 800) => String(value ?? '').trim().slice(0, max);

const DIALECT_LOCALES = Object.freeze({
  egyptian: 'ar-EG',
  syrian: 'ar-SY',
  lebanese: 'ar-LB',
  gulf: 'ar-AE'
});

const ARABIC_STOPWORDS = new Set([
  'من','في','على','الى','إلى','عن','مع','هذا','هذه','ده','دي','هيدا','هيدي','هال',
  'اللي','الي','انا','أنا','انت','إنت','انتي','إنتي','هو','هي','هم','همه','و','يا','لو','بس'
]);

function normalizeArabic(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ar')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,،:؛!?؟(){}\[\]"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDialectText(value) {
  const text = normalizeArabic(value);
  return text
    .replace(/(بدّي|بدي|حابب|حابه|حاب|نفسي|ممكن)/g, 'عايز')
    .replace(/(شو|إيش|ايش)/g, 'ايه')
    .replace(/(وين)/g, 'فين')
    .replace(/(هلق|هلأ|هلاء)/g, 'دلوقتي')
    .replace(/(هيدا|هيدي|هالطبق|هالشي|هال)/g, 'ده')
    .replace(/(مو)/g, 'مش')
    .replace(/(كتير)/g, 'اوي')
    .replace(/(فيك|فيني|فينا)/g, 'تقدر')
    .replace(/(مشان|كرمال)/g, 'عشان')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDialect(value) {
  const raw = normalizeArabic(value);
  if (!raw) return 'gulf';
  const lebanese = /(هيدا|هيدي|هال|شو|وين|كتير|فيك|فينا|عنجد|ليش|كرمال|مشان)/.test(raw);
  const syrian = /(هلق|هلأ|لسا|شلون|شو|وين|كتير|بدي|مو|هيك|مشان)/.test(raw);
  const egyptian = /(عايز|عاوز|نفسي|ايه|إيه|فين|دلوقتي|دلوقت|كده|ليه|مش|احنا|اوي|ازاي)/.test(raw);
  if (lebanese && !egyptian) return 'lebanese';
  if (syrian && !egyptian) return 'syrian';
  if (egyptian) return 'egyptian';
  return 'gulf';
}

function dialectLocale(value) {
  return DIALECT_LOCALES[detectDialect(value)] || DIALECT_LOCALES.gulf;
}

function significantTokens(value) {
  return normalizeDialectText(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !ARABIC_STOPWORDS.has(token));
}

function jsonFromText(value) {
  const raw = clean(value, 5000);
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

function isSafeInternalSlug(value) {
  return /^[a-z0-9\u0600-\u06ff-]{1,160}$/i.test(String(value ?? ''));
}

function isSafeInternalPath(value) {
  const path = clean(value, 180);
  if (ALLOWED_PATHS.has(path)) return true;
  if (/^\/menu\//.test(path) || /^\/events\//.test(path)) {
    const parts = path.split('/').filter(Boolean);
    return (parts.length === 2 || parts.length === 3) && parts.slice(1).every(isSafeInternalSlug);
  }
  return false;
}

function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function parseToolArgs(value) {
  if (value && typeof value === 'object') return value;
  const raw = clean(value, 1200);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}


function parseQuantity(text) {
  const raw = clean(text, 300).toLowerCase();
  const digit =
    raw.match(/(?:عدد|كمية|كم)\s*(\d{1,2})\b/i) ||
    raw.match(/\b(\d{1,2})\s*(?:من|حبة|حبات|قطع|قطعة)\b/i) ||
    raw.match(/(?:×|x)\s*(\d{1,2})\b/i);
  if (digit) {
    const value = Number(digit[1]);
    if (value >= 1 && value <= 20) return value;
  }
  const words = [
    [/(عشرين)/i, 20], [/(تسعتاشر|تسعة عشر)/i, 19], [/(تمنتاشر|ثمانية عشر)/i, 18],
    [/(سبعتاشر|سبعة عشر)/i, 17], [/(ستاشر|ستة عشر)/i, 16], [/(خمستاشر|خمسة عشر)/i, 15],
    [/(اربعتاشر|أربعة عشر)/i, 14], [/(تلتاشر|ثلاثة عشر|ثلاثه عشر)/i, 13],
    [/(اتناشر|اثنا عشر|اثني عشر)/i, 12], [/(حداشر|أحد عشر)/i, 11],
    [/(عشرة|عشر)/i, 10], [/(تسعة|تسع)/i, 9], [/(ثمانية|تمانية|تمنية|ثماني)/i, 8],
    [/(سبعة|سبع)/i, 7], [/(ستة|سته|ست)/i, 6], [/(خمسة|خمسه|خمس)/i, 5],
    [/(أربعة|اربعه|اربعة|أربع)/i, 4], [/(ثلاثة|ثلاثه|تلاتة|ثلاث)/i, 3],
    [/(اتنين|اثنين|اثنان|ثنتين|شخصين)/i, 2]
  ];
  for (const [pattern, value] of words) {
    if (pattern.test(raw) && /(?:ضيف|أضف|اضف|حط|ضيفي|عايز|عاوز)/i.test(raw)) return value;
  }
  return 1;
}

function safeWorkflowSlots(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allowed = ['date', 'time', 'guests', 'eventSlug', 'orderType', 'tableNumber'];
  return Object.fromEntries(
    allowed
      .filter(key => source[key] !== undefined && source[key] !== null && source[key] !== '')
      .map(key => [key, source[key]])
  );
}

function buildJourneyContext(customerContext, memory) {
  const durable = customerContext?.journey && typeof customerContext.journey === 'object'
    ? customerContext.journey
    : {};
  const conversational = memory?.journey && typeof memory.journey === 'object'
    ? memory.journey
    : {};

  return {
    stage: clean(durable.stage || '', 50),
    nextBestAction: clean(durable.nextBestAction || '', 60),
    reason: clean(durable.reason || '', 240),
    lastIntent: clean(memory?.lastIntent || conversational.intent || '', 60),
    currentStep: clean(conversational.step || '', 60),
    hasUpcomingReservation: Boolean(customerContext?.nextReservation),
    favoriteProductNames: Array.isArray(customerContext?.favoriteProducts)
      ? customerContext.favoriteProducts.slice(0, 3).map(item => clean(item?.name, 120)).filter(Boolean)
      : [],
    favoriteCategoryNames: Array.isArray(customerContext?.favoriteCategories)
      ? customerContext.favoriteCategories.slice(0, 3).map(item => clean(item?.name, 120)).filter(Boolean)
      : []
  };
}

function journeyAwareUnknownReply(customer, journey) {
  const name = customer?.name ? ' يا ' + clean(customer.name, 80) : '';
  if (journey?.stage === 'upcoming_reservation') {
    return 'أنا معاك' + name + '. عندك حجز قادم، وتقدر تسألني عنه أو عن الأكل المناسب للزيارة.';
  }
  if (journey?.stage === 'returning_favorite' && journey.favoriteProductNames?.length) {
    return 'أنا معاك' + name + '. أقدر أرجح لك من أطباقك المفضلة أو أساعدك تختار حاجة جديدة.';
  }
  if (journey?.stage === 'reengagement') {
    return 'نورت تاني' + name + '. أقدر أساعدك تختار من اللي بتحبه أو نجرب حاجة مختلفة.';
  }
  if (journey?.stage === 'new_customer') {
    return 'أهلاً بيك' + name + '. أقدر أعرّفك بالمنيو أو أساعدك تختار أو تحجز.';
  }
  return customer?.name
    ? 'أنا معك يا ' + clean(customer.name, 80) + '. قل لي اللي في بالك، حتى لو بالعامية المصرية أو الشامية، وأنا أفهمك ونمشي خطوة خطوة.'
    : 'أنا معك. قل لي اللي في بالك، حتى لو بالعامية المصرية أو الشامية، وأنا أفهمك ونمشي خطوة خطوة.';
}

function sanitizeToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls
    .slice(0, MAX_TOOL_CALLS)
    .map(call => ({
      name: clean(call?.name, 50),
      args: call?.args && typeof call.args === 'object' ? call.args : {}
    }))
    .filter(call => ALLOWED_TOOLS.has(call.name))
    .filter(call => {
      if (call.name === 'navigate') {
        const path = clean(call.args.path, 180);
        const hasStructuredTarget = Boolean(clean(call.args.categoryId, 80) || clean(call.args.productId, 80));
        if (ALLOWED_PATHS.has(path) || hasStructuredTarget) return true;
        return isSafeInternalPath(path);
      }
      if (call.name === 'get_order_status') return /^O\d{5}$/i.test(clean(call.args.orderId, 20));
      if (call.name === 'cart_add') return Boolean(clean(call.args.productId, 60));
      return true;
    })
    .map(call => {
      if (call.name !== 'cart_add') return call;
      return {
        ...call,
        args: {
          ...call.args,
          quantity: Math.min(20, Math.max(1, Number(call.args.quantity) || 1))
        }
      };
    });
}

function normalizeIntent(value) {
  const allowed = new Set([
    'greeting', 'menu', 'navigate', 'category_selection', 'recommend', 'cart', 'cart_summary', 'reservation',
    'reservation_status', 'order', 'order_status', 'events', 'memories', 'product_search', 'product_info',
    'cart_add', 'unknown'
  ]);
  return allowed.has(value) ? value : 'unknown';
}

function findMatches(products, query) {
  const rawQuery = normalizeArabic(query);
  const normalizedQuery = normalizeDialectText(query);
  const tokens = significantTokens(query);
  if (!rawQuery && !tokens.length) return [];

  return products.map(product => {
    const haystack = [
      product.nameAr, product.nameEn, product.descriptionAr, product.descriptionEn,
      product.categorySlug, product.categoryId, product.categoryNameAr, product.categoryNameEn,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.aliases) ? product.aliases : [])
    ].join(' ');
    const normalizedHaystack = normalizeDialectText(haystack);
    const hayTokens = new Set(significantTokens(haystack));
    let score = 0;

    if (normalizedQuery && normalizedHaystack.includes(normalizedQuery)) score += 14;
    if (rawQuery && normalizeArabic(haystack).includes(rawQuery)) score += 10;

    for (const token of tokens) {
      if (hayTokens.has(token)) score += 6;
      else if ([...hayTokens].some(candidate => candidate.startsWith(token) || token.startsWith(candidate))) score += 3;
    }

    if (product.chefChoice === true) score += 1;
    if (product.isNew === true) score += 0.5;
    return { product, score };
  })
  .filter(row => row.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 6)
  .map(row => row.product);
}

function extractLocalPreferences(text) {
  const raw = normalizeDialectText(text);
  const preferences = {};

  if (/(حار|سبايسي|spicy)/i.test(raw)) preferences.spicy = true;
  if (/(مش حار|مو حار|بدون حار|غير حار|ما بدي حار|مش سبايسي|مو سبايسي)/i.test(raw)) preferences.spicy = false;
  if (/(نباتي|نباتيه|vegetarian|vegan)/i.test(raw)) preferences.vegetarian = true;

  if (/(حلو|حلويات|تحليه|تحلية|ديسرت|dessert|سكر|شوكولاته)/i.test(raw)) preferences.taste = 'sweet';
  else if (/(مالح|حادق)/i.test(raw)) preferences.taste = 'savory';
  else if (/(خفيف|خفيفه|خفيفا|light)/i.test(raw)) preferences.weight = 'light';
  else if (/(مشبع|دسم|تقيل|ثقيل|وجبه كامله)/i.test(raw)) preferences.weight = 'hearty';

  if (/(مشروب|مشروبات|شراب|عصير|قهوه|قهوة|شاي|لاتيه|كوفي|drink)/i.test(raw)) preferences.category = 'drink';
  if (/(دجاج|فراخ|فراخ|chicken)/i.test(raw)) preferences.protein = 'chicken';
  if (/(لحمه|لحمة|لحم|ستيك|beef|meat)/i.test(raw)) preferences.protein = 'beef';
  if (/(سمك|بحري|جمبري|روبيان|seafood|fish|shrimp)/i.test(raw)) preferences.protein = 'seafood';

  const budget = raw.match(/(?:حدي|ميزانيتي|ميزانيه|لحد|حتى|تحت|اقل من|أقل من)\s*(\d{2,4})/) ||
    raw.match(/(\d{2,4})\s*(?:درهم|aed|د)/i);
  const budgetValue = Number(budget?.[1] || 0);
  if (budgetValue > 0) preferences.budgetAed = budgetValue;

  return preferences;
}

function scoreProductForPreferences(product, preferences) {
  const p = preferences || {};
  const haystack = normalizeArabic([
    product?.nameAr,
    product?.nameEn,
    product?.descriptionAr,
    product?.descriptionEn,
    product?.categorySlug,
    ...(Array.isArray(product?.tags) ? product.tags : [])
  ].join(' '));

  let score = 0;

  if (p.taste === 'sweet' && /(حلو|حلوي|شوكولاته|ديسرت|كيك|ايس كريم|dessert|chocolate)/i.test(haystack)) score += 10;
  if (p.taste === 'savory' && !/(حلو|ديسرت|كيك|شوكولاته)/i.test(haystack)) score += 3;

  if (p.weight === 'light' && /(سلطه|شوربه|خفيف|خضار|فواكه|grill)/i.test(haystack)) score += 7;
  if (p.weight === 'hearty' && /(وجبه|لحم|دجاج|رز|ستيك|برجر|باستا)/i.test(haystack)) score += 7;

  if (p.category === 'drink' && /(مشروب|عصير|قهوه|قهوة|شاي|لاتيه|كوفي|drink)/i.test(haystack)) score += 10;
  if (p.protein === 'chicken' && /(دجاج|فراخ|chicken)/i.test(haystack)) score += 8;
  if (p.protein === 'beef' && /(لحم|لحمه|ستيك|beef|meat)/i.test(haystack)) score += 8;
  if (p.protein === 'seafood' && /(سمك|بحري|جمبري|روبيان|seafood|fish|shrimp)/i.test(haystack)) score += 8;

  if (p.spicy === true && (product?.tags?.includes?.('spicy') || Number(product?.spiceLevel || 0) > 0)) score += 5;
  if (p.spicy === false && (product?.tags?.includes?.('spicy') || Number(product?.spiceLevel || 0) > 0)) score -= 7;
  if (p.vegetarian === true && (product?.dietary?.includes?.('vegetarian') || product?.dietary?.includes?.('vegan'))) score += 7;
  if (p.vegetarian === true && !product?.dietary?.includes?.('vegetarian') && !product?.dietary?.includes?.('vegan')) score -= 3;
  if (p.budgetAed && Number(product?.price || 0) <= p.budgetAed) score += 3;
  if (p.budgetAed && Number(product?.price || 0) > p.budgetAed) score -= 8;

  return score;
}

function pickSmartLocalRecommendations(products, memory, text, customerContext = null) {
  const extracted = extractLocalPreferences(text);
  const stored = memory?.preferences || {};
  const preferences = {
    ...stored,
    ...extracted
  };
  const favoriteProducts = new Set(
    Array.isArray(customerContext?.favoriteProducts)
      ? customerContext.favoriteProducts.map(item => normalizeArabic(item?.name)).filter(Boolean)
      : []
  );
  const favoriteCategories = new Set(
    Array.isArray(customerContext?.favoriteCategories)
      ? customerContext.favoriteCategories.map(item => normalizeArabic(item?.name)).filter(Boolean)
      : []
  );
  const journeyStage = customerContext?.journey?.stage || '';

  const ranked = products
    .filter(item => item?.available !== false)
    .map(product => {
      const productName = normalizeArabic(product?.nameAr || product?.nameEn || '');
      const productCategory = normalizeArabic(product?.categoryNameAr || product?.categoryNameEn || '');
      let score =
        scoreProductForPreferences(product, preferences) +
        (product.chefChoice ? 3 : 0) +
        (product.isNew ? 1.5 : 0) +
        (Number(product.rating || 0) / 5);

      if (favoriteProducts.has(productName)) score += 8;
      if (favoriteCategories.has(productCategory)) score += 4;
      if (journeyStage === 'returning_favorite' && favoriteProducts.has(productName)) score += 4;
      if (journeyStage === 'reengagement' && favoriteCategories.has(productCategory)) score += 2;
      if (journeyStage === 'new_customer' && !favoriteProducts.size && product.chefChoice) score += 1;

      return {
        product,
        score,
        productName,
        productCategory,
        isFavorite: favoriteProducts.has(productName),
        matchesFavoriteCategory: favoriteCategories.has(productCategory)
      };
    })
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const selectedIds = new Set();
  const addUnique = row => {
    if (!row?.product?.id || selectedIds.has(String(row.product.id))) return false;
    selected.push(row.product);
    selectedIds.add(String(row.product.id));
    return true;
  };

  if (journeyStage === 'returning_favorite' || journeyStage === 'reengagement') {
    addUnique(ranked.find(row => row.isFavorite));
    addUnique(ranked.find(row => row.matchesFavoriteCategory && !row.isFavorite));
    addUnique(ranked.find(row => !row.isFavorite && !row.matchesFavoriteCategory && (row.product.chefChoice || row.product.isNew)));
  }

  for (const row of ranked) {
    if (selected.length >= 3) break;
    addUnique(row);
  }

  return {
    candidates: selected.slice(0, 3),
    preferences
  };
}

function resolveReferenceProduct(text, matches, latest) {
  const normalized = normalizeDialectText(text);
  if (/(التاني|الثاني|تاني واحد|رقم 2)/i.test(normalized) && matches[1]) return matches[1];
  if (/(التالت|الثالث|تالت واحد|رقم 3)/i.test(normalized) && matches[2]) return matches[2];
  if (/(الاول|الأول|اول واحد|رقم 1)/i.test(normalized)) return matches[0] || latest || null;
  if (/(ده|دي|هالطبق|هيدا|هيدي|الطبق ده|الطبق دي|نفسه|نفسها|نفس الطبق|كمان واحد|واحد كمان)/i.test(normalized)) {
    return latest || matches[0] || null;
  }
  return matches[0] || latest || null;
}

function pickRecommendations(products, preferences, query) {
  const budget = Number(preferences?.budgetAed || 0);
  const spicy = preferences?.spicy === true || /حار|سبايسي|spicy/i.test(query);
  const vegetarian = preferences?.vegetarian === true || /نباتي|نباتية|vegetarian|vegan/i.test(query);

  const candidates = products
    .filter(item => item?.available !== false)
    .filter(item => !budget || Number(item.price || 0) <= budget)
    .filter(item => !vegetarian || item.dietary?.includes?.('vegetarian') || item.dietary?.includes?.('vegan') || /خضار|vegetable|سلط/i.test(String(item.nameAr || '')))
    .filter(item => !spicy || item.tags?.includes?.('spicy') || Number(item.spiceLevel || 0) > 0);

  return candidates
    .map(product => ({
      product,
      score:
        (product.chefChoice === true ? 4 : 0) +
        (product.isNew === true ? 2 : 0) +
        (Number(product.rating || 0) / 5) +
        (budget ? Math.max(0, 1 - Number(product.price || 0) / Math.max(1, budget)) : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(row => row.product);
}

function detectLocalPlan({ message, memory, products, customerContext = null }) {
  const text = clean(message);
  const normalized = normalizeDialectText(text);
  const matches = findMatches(products, text);
  const latest = memory.recentProducts?.[memory.recentProducts.length - 1] || null;
  const prefs = extractLocalPreferences(text);

  if (/^(السلام عليكم|السلام|اهلا|اهلين|يا هلا|هلا|مرحبا|مرحبتين|هاي|hello|hi)/i.test(normalized)) {
    return {
      intent: 'greeting',
      reply: memory.name
        ? 'أهلاً يا ' + memory.name + '، نورت ARABISK. أنا شمس، معاك علشان أساعدك.'
        : 'أهلاً بيك في ARABISK. أنا شمس، معاك علشان أساعدك.'
    };
  }

  const recommendationSignal =
    /(رشح|رشحلي|رشح لي|اقترح|اقترحلي|انصحني|نصحني|شو بتنصحني|شو تقترح|شو بترشح|محتار|محتارة|اختار|اختيار|دلني|دُلني|عايز حاجة|عاوز حاجه|نفسي في|بدي شي|بدي اكل|شو اكل|شو آكل|ايه الاحسن|شو الاحسن|what.*recommend|المفضل|المفضلة|المفضلي|اللي بحبه|اللي بحبو|اللي باخده دايم|اللي باخدو دايم|زي اللي فات|زي المرة اللي فاتت|نفس اللي بطلبه|نفس طلباتي|عادتي)/i.test(normalized) ||
    Object.keys(prefs).length > 0;

  if (recommendationSignal && !/(ضيف|اضف|حط|زود|زيد|ضيفلي|اضفلي|حطلي|زودلي|زيدلي)/i.test(normalized)) {
    return { intent: 'recommend', toolCalls: [{ name: 'recommend_menu', args: { ...prefs } }] };
  }

  const addRequested = /(ضيف|اضف|حط|زود|زيد|ضيفلي|اضفلي|حطلي|زودلي|زيدلي)/i.test(normalized) ||
    /(عايز|عاوز|بدي).{0,70}(واحد|اتنين|تلاته|ثلاثة|كمان)/i.test(normalized);

  if (addRequested || (latest && /(كمان واحد|واحد كمان|زود|زيد|ضيفه|ضيفها|حطه|حطها)/i.test(normalized))) {
    const product = resolveReferenceProduct(text, matches, latest);
    if (product) {
      return {
        intent: 'cart_add',
        toolCalls: [{ name: 'cart_add', args: { productId: product.id, quantity: parseQuantity(normalized) } }],
        reply: 'حاضر، أضيف لك ' + (product.nameAr || product.nameEn) + '.'
      };
    }
    if (Object.keys(prefs).length) {
      return { intent: 'recommend', toolCalls: [{ name: 'recommend_menu', args: { ...prefs } }] };
    }
    return { intent: 'cart_add', reply: 'أكيد. قل لي اسم الطبق أو صفه لي، وأنا أضيفه لك.' };
  }

  if (/(منيو|القائمة|الأكل|الأطباق|شو عنا|شو عندكم|شو موجود|وريني|ورجيني|جيبلي.*منيو|افتح.*منيو|شوف.*منيو)/i.test(normalized)) {
    return { intent: 'menu', toolCalls: [{ name: 'navigate', args: { path: '/menu' } }], reply: 'أكيد، أفتح لك المنيو الآن.' };
  }

  if (/(احجز|حجز|حجزي|طاولة|حاجز|موعد|بدي حجز|بدّي احجز|عايز احجز|عايز حجز)/i.test(normalized)) {
    return { intent: 'reservation', toolCalls: [{ name: 'navigate', args: { path: '/reservation' } }], reply: 'أكيد، نبدأ الحجز من هنا.' };
  }

  if (/(السلة|العربة|شو بالسلة|شو عندي بالسلة|cart)/i.test(normalized)) {
    if (/(فيها|موجود|محتوى|محتويات|المجموع|الإجمالي|بكام|كام|اعرض|وريني|شوف|شو)/i.test(normalized)) {
      return { intent: 'cart_summary', toolCalls: [{ name: 'cart_summary', args: {} }] };
    }
    return { intent: 'cart', toolCalls: [{ name: 'navigate', args: { path: '/cart' } }], reply: 'حاضر، أفتح لك السلة.' };
  }

  if (/(متابعة|تتبع|الطلب|الطلبات|طلبي|شو صار بطلب|وين طلبي|order)/i.test(normalized)) {
    const orderMatch = normalized.match(/\bo\d{5}\b/i);
    if (orderMatch) {
      return { intent: 'order_status', toolCalls: [{ name: 'get_order_status', args: { orderId: orderMatch[0].toUpperCase() } }] };
    }
    return { intent: 'order_status', toolCalls: [{ name: 'navigate', args: { path: '/track-order' } }], reply: 'أفتح لك متابعة الطلب، وهناك نكمل التتبع.' };
  }

  if (/(فعالي|تجارب|حدث|شو في فعاليات|events)/i.test(normalized)) {
    return { intent: 'events', toolCalls: [{ name: 'navigate', args: { path: '/events' } }], reply: 'أفتح لك التجارب والفعاليات القادمة.' };
  }

  if (/(ذكريات|صور|فيديو|فديو|memories)/i.test(normalized)) {
    return { intent: 'memories', toolCalls: [{ name: 'navigate', args: { path: '/memories' } }], reply: 'أفتح لك ذكريات ARABISK.' };
  }

  if (matches.length) {
    return { intent: 'product_search', toolCalls: [{ name: 'search_menu', args: { query: text } }] };
  }

  return {
    intent: 'unknown',
    reply: memory.name
      ? 'أنا معك يا ' + memory.name + '. قل لي اللي في بالك، حتى لو بالعامية المصرية أو الشامية، وأنا أفهمك ونمشي خطوة خطوة.'
      : 'أنا معك. قل لي اللي في بالك، حتى لو بالعامية المصرية أو الشامية، وأنا أفهمك ونمشي خطوة خطوة.'
  };
}

function pendingActionIsUsable(pending) {
  return Boolean(pending?.type && Number(pending.expiresAt || 0) > Date.now());
}

function buildLocalReply(intent, data) {
  if (intent === 'recommend') {
    const products = data.recommendations || [];
    if (!products.length) return 'ساعدني بتحديد ميزانيتك أو ذوقك، مثل: أريد شيئًا خفيفًا أو حارًا أو نباتيًا.';
    const lines = products.map(item => (item.nameAr || item.nameEn) + ' بسعر ' + item.price + ' درهم').join('، ');
    const journey = data.journey || {};
    const prefix = journey.stage === 'returning_favorite'
      ? 'وبناءً على اختياراتك السابقة، '
      : journey.stage === 'reengagement'
        ? 'وبما إنك راجع لنا، '
        : journey.stage === 'upcoming_reservation'
          ? 'وبما إن عندك زيارة قريبة، '
          : '';
    return prefix + 'رشحت لك ' + lines + '. وإذا أعجبك أول اختيار أضيفه لك للسلة.';
  }

  if (intent === 'menu') return data.menuOpened ? 'أكيد، أفتح لك المنيو الآن.' : 'تعذر فتح المنيو الآن.';
  if (intent === 'navigate') return data.navigationOpened ? 'أكيد، أفتح لك الصفحة المطلوبة الآن.' : 'لم أستطع فتح الصفحة المطلوبة.';
  if (intent === 'category_selection') return 'حدد لي الصنف المطلوب من القسم.';
  if (intent === 'cart') return data.cartOpened ? 'حاضر، أفتح لك السلة.' : 'تعذر فتح السلة الآن.';
  if (intent === 'events') return data.eventsOpened ? 'أفتح لك التجارب والفعاليات القادمة.' : 'تعذر فتح الفعاليات الآن.';
  if (intent === 'memories') return data.memoriesOpened ? 'أفتح لك ذكريات ARABISK.' : 'تعذر فتح الذكريات الآن.';
  if (intent === 'product_search') {
    const products = data.matches || [];
    if (!products.length) return 'لم أجد طبقًا مطابقًا تمامًا. قل لي اسمًا آخر أو نوع الأكل الذي تريده.';
    return 'وجدت لك ' + products.slice(0, 3).map(item => item.nameAr || item.nameEn).join('، ') + '.';
  }

  if (intent === 'product_info') {
    const product = data.product;
    if (!product) return 'لم أجد تفاصيل الطبق في المنيو الحالية.';
    const description = product.descriptionAr ? ' — ' + product.descriptionAr : '';
    const price = Number.isFinite(Number(product.price)) ? ' بسعر ' + Number(product.price) + ' درهم' : '';
    return (product.nameAr || product.nameEn) + price + description + '.';
  }

  if (intent === 'cart_summary') {
    const items = data.cartSummary?.items || [];
    if (!items.length) return 'السلة فارغة حاليًا.';
    const summary = items.slice(0, 5)
      .map(item => String(item.quantity) + ' × ' + item.nameAr)
      .join('، ');
    return 'في السلة ' + summary + ' بإجمالي ' + Number(data.cartSummary.total || 0) + ' درهم.';
  }
  if (intent === 'cart_add') return data.added?.nameAr ? 'تمت إضافة ' + data.added.nameAr + ' إلى السلة.' : 'تمت إضافة الطبق إلى السلة.';
  if (intent === 'order_status') {
    if (data.order) {
      const map = {
        pending: 'قيد الانتظار',
        confirmed: 'تم التأكيد',
        preparing: 'قيد التحضير',
        ready: 'جاهز',
        completed: 'مكتمل',
        cancelled: 'ملغى'
      };
      return 'طلبك ' + data.order.id + ' حالته الآن ' + (map[data.order.status] || data.order.status) + '.';
    }
    return null;
  }
  return null;
}

export function createShamsAgent({ repository, memoryService, workflowService, requestModel = null }) {
  const categories = () => (repository.categories?.all?.() || [])
    .filter(item => item?.active !== false)
    .map(item => ({
      ...item,
      nameAr: clean(item.nameAr, 120),
      nameEn: clean(item.nameEn, 120)
    }));

  const products = () => repository.products.all()
    .filter(item => item?.available !== false)
    .map(item => {
      const category = categories().find(row => String(row.id) === String(item.categoryId));
      return {
        ...item,
        categoryNameAr: category?.nameAr || '',
        categoryNameEn: category?.nameEn || ''
      };
    });

  function resolveNavigation(args = {}, catalog = products()) {
    const currentPath = clean(args.path, 180);
    const categoryId = clean(args.categoryId, 80);
    const productId = clean(args.productId, 80);
    const categoryList = categories();

    if (categoryId || productId) {
      const product = productId ? catalog.find(item => String(item.id) === productId) : null;
      const category = categoryList.find(item =>
        String(item.id) === String(categoryId || product?.categoryId || '') ||
        slug(item.id) === slug(categoryId || product?.categoryId || '')
      );
      if (!category) return null;
      if (productId) {
        if (!product || String(product.categoryId) !== String(category.id)) return null;
        return '/menu/' + slug(category.id) + '/' + slug(product.nameEn || product.nameAr || product.id);
      }
      return '/menu/' + slug(category.id);
    }

    if (ALLOWED_PATHS.has(currentPath)) return currentPath;
    if (/^\/events\//.test(currentPath)) {
      return isSafeInternalPath(currentPath) ? currentPath : null;
    }
    if (!currentPath.startsWith('/menu/')) return null;

    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length === 2) {
      const categoryKey = parts[1];
      const category = categoryList.find(item =>
        slug(item.id) === slug(categoryKey) ||
        slug(item.nameAr) === slug(categoryKey) ||
        slug(item.nameEn) === slug(categoryKey)
      );
      return category ? '/menu/' + slug(category.id) : null;
    }

    if (parts.length === 3) {
      const categoryKey = parts[1];
      const productKey = parts[2];
      const category = categoryList.find(item =>
        slug(item.id) === slug(categoryKey) ||
        slug(item.nameAr) === slug(categoryKey) ||
        slug(item.nameEn) === slug(categoryKey)
      );
      if (!category) return null;
      const product = catalog.find(item =>
        String(item.categoryId) === String(category.id) &&
        (String(item.id).toLowerCase() === productKey.toLowerCase() ||
          slug(item.nameAr) === slug(productKey) ||
          slug(item.nameEn) === slug(productKey))
      );
      return product
        ? '/menu/' + slug(category.id) + '/' + slug(product.nameEn || product.nameAr || product.id)
        : null;
    }

    return null;
  }

  function buildIdentity({ customer, sessionId }) {
    return customer?.id
      ? { customerId: String(customer.id), sessionId: clean(sessionId, 120) }
      : { sessionId: clean(sessionId, 120) };
  }

  async function toolExecute(name, args, context) {
    const catalog = products();

    if (name === 'search_menu') {
      const query = clean(args?.query || context.message, 220);
      const preferredIds = Array.isArray(args?.productIds)
        ? args.productIds.map(id => String(id)).slice(0, 6)
        : [];
      const matches = preferredIds.length
        ? preferredIds.map(id => catalog.find(item => String(item.id) === id)).filter(Boolean)
        : findMatches(catalog, query);
      return { matches };
    }

    if (name === 'recommend_menu') {
      const smart = pickSmartLocalRecommendations(catalog, context.memory, context.message, context.customerContext);
      return { recommendations: smart.candidates, preferences: smart.preferences };
    }

    if (name === 'product_info') {
      const productId = clean(args?.productId, 60);
      const query = clean(args?.query || context.message, 220);
      const product = productId
        ? catalog.find(item => String(item.id) === productId)
        : findMatches(catalog, query)[0] || null;
      if (!product) return { error: 'لم أجد هذا الطبق في المنيو الحالية.' };
      return {
        product: {
          id: String(product.id),
          nameAr: clean(product.nameAr, 160),
          nameEn: clean(product.nameEn, 160),
          descriptionAr: clean(product.descriptionAr, 320),
          descriptionEn: clean(product.descriptionEn, 320),
          price: Number(product.price || 0),
          categorySlug: clean(product.categorySlug, 80),
          tags: Array.isArray(product.tags) ? product.tags.slice(0, 10) : [],
          dietary: Array.isArray(product.dietary) ? product.dietary.slice(0, 10) : [],
          spiceLevel: Number(product.spiceLevel || 0),
          chefChoice: Boolean(product.chefChoice),
          isNew: Boolean(product.isNew)
        }
      };
    }

    if (name === 'cart_summary') {
      const items = (Array.isArray(context.cart) ? context.cart : [])
        .slice(0, 20)
        .map(item => {
          const id = clean(item?.id, 60);
          const product = catalog.find(row => String(row.id) === id);
          const quantity = Math.min(20, Math.max(1, Number(item?.quantity || item?.qty) || 1));
          const unitPrice = Number(product?.price ?? item?.price ?? 0);
          const nameAr = clean(item?.nameAr || product?.nameAr || product?.nameEn || id, 120);
          return {
            id,
            nameAr,
            quantity,
            unitPrice,
            lineTotal: unitPrice * quantity
          };
        })
        .filter(item => item.id);
      return {
        items,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        total: items.reduce((sum, item) => sum + item.lineTotal, 0)
      };
    }

    if (name === 'cart_add') {
      const productId = clean(args?.productId, 60);
      const product = catalog.find(item => String(item.id) === productId);
      const quantity = Math.min(20, Math.max(1, Number(args?.quantity) || 1));
      if (!product) return { error: 'الصنف لم يعد متاحًا.' };
      return {
        added: {
          id: String(product.id),
          nameAr: clean(product.nameAr, 120),
          nameEn: clean(product.nameEn, 120),
          price: Number(product.price || 0),
          imageUrl: clean(product.imageUrl, 500)
        },
        quantity,
        clientAction: {
          type: 'cart.add',
          product: {
            id: String(product.id),
            nameAr: clean(product.nameAr, 120),
            nameEn: clean(product.nameEn, 120),
            price: Number(product.price || 0),
            imageUrl: clean(product.imageUrl, 500)
          },
          quantity
        }
      };
    }

    if (name === 'navigate') {
      const path = resolveNavigation(args, catalog);
      return path
        ? { clientAction: { type: 'navigate', url: path } }
        : { error: 'لم أجد الصفحة أو القسم المطلوب داخل ARABISK.' };
    }

    if (name === 'get_order_status') {
      const orderId = clean(args?.orderId, 20).toUpperCase();
      const order = repository.orders.findById(orderId);
      if (!order) return { error: 'لم أجد هذا الطلب.' };
      if (!context.customer?.id || String(order.customerId || '') !== String(context.customer.id)) {
        return { error: 'أحتاج ربط الطلب بحسابك قبل عرض حالة الطلب صوتيًا.' };
      }
      return {
        order: {
          id: order.id,
          status: order.status,
          total: Number(order.total || 0),
          items: Array.isArray(order.items)
            ? order.items.slice(0, 10).map(item => ({
                nameAr: clean(item.nameAr, 100),
                quantity: Number(item.quantity || 1)
              }))
            : []
        }
      };
    }

    return { error: 'الأداة غير متاحة.' };
  }

  async function modelPlan(context) {
    if (typeof requestModel !== 'function') return null;

    const categoryCatalog = categories().slice(0, 48).map(item => ({
      id: String(item.id),
      nameAr: clean(item.nameAr, 100),
      nameEn: clean(item.nameEn, 100)
    }));
    const catalog = products().slice(0, 48).map(item => ({
      id: String(item.id),
      nameAr: clean(item.nameAr, 100),
      nameEn: clean(item.nameEn, 100),
      descriptionAr: clean(item.descriptionAr, 180),
      descriptionEn: clean(item.descriptionEn, 180),
      price: Number(item.price || 0),
      categoryId: clean(item.categoryId, 80),
      categorySlug: clean(item.categorySlug, 80),
      categoryNameAr: clean(item.categoryNameAr, 100),
      categoryNameEn: clean(item.categoryNameEn, 100),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
      dietary: Array.isArray(item.dietary) ? item.dietary.slice(0, 6) : [],
      spiceLevel: Number(item.spiceLevel || 0),
      chefChoice: Boolean(item.chefChoice),
      isNew: Boolean(item.isNew)
    }));

    const prompt = [
      'أنتِ شمس Agent لمطعم ARABISK. افهم العربية الفصحى واللهجات المصرية والشامية (السورية واللبنانية) والخليجية.',
      'افهم المعنى والسياق وليس التطابق الحرفي. تعامل مع أخطاء تحويل الصوت إلى نص والألفاظ العامية والاختصارات.',
      'أخرجي JSON فقط بالشكل المحدد في استجابة النظام. عندما تستدعين أداة، اكتبي argsJson كسلسلة JSON صحيحة مثل "{\"productId\":\"P001\"}" ولا تخترعي أي معرّف من خارج الكتالوج.',
      'الأدوات المسموحة: search_menu, recommend_menu, product_info, cart_summary, cart_add, navigate, get_order_status.',
      'التنقل مسموح إلى الصفحات العامة داخل ARABISK، وإلى /menu/<category> و/menu/<category>/<product> فقط من الكتالوج. استخدمي categoryId أو productId مع navigate بدل اختراع مسار.',
      'لا تدّعي نجاح إضافة أو تنفيذ أي شيء قبل نتيجة الأداة. التنفيذ النهائي للحجز أو الطلب يحتاج تأكيد العميل.',
      'لا تطلبي كلمات مرور أو OTP أو بيانات بطاقات، ولا تخترعي بيانات غير موجودة.',
      'استخدمي workflow لكل حقول الحجز والطلب الموجودة فعليًا، ولا تعيدي طلب حقل موجود بالفعل في الذاكرة أو الحساب.',
      'استخدمي السياق السابق لفهم عبارات مثل: ده، دي، هيدا، هيدي، هالطبق، التاني، الأول، اللي فات، كمان واحد، واللي باخده دايمًا.',
      'استخدمي رحلة العميل عندما تكون مفيدة مباشرة: الحجز القادم، العودة، المفضلات، أو إعادة التفاعل. لا تعرضي للعميل تفاصيل داخلية مثل قيمة الإنفاق أو عدد الأجهزة.',
      'إذا كانت الرسالة حجزًا أو طلبًا ناقصًا، استخرجي كل الحقول الموجودة فقط في workflow ولا تخترعي أي حقل.',
      'اللهجة المكتشفة مبدئيًا: ' + dialectLocale(context.message),
      'الوقت المرجعي للمطعم: ' + JSON.stringify(getUaeTimeContext()),
      'عند تفسير اليوم/غدًا/بعد غد أو موعد نسبي، استخدمي هذا الوقت المحلي لأبوظبي فقط، ولا تعتمدي على توقيت السيرفر.',
      'النص المطبع: ' + context.normalizedMessage,
      'العميل الحالي: ' + JSON.stringify(context.customer ? { id: context.customer.id, name: context.customer.name || '' } : null),
      'سياق العميل الآمن: ' + JSON.stringify(context.customerContext || null),
      'سياق رحلة شمس الموحّد: ' + JSON.stringify(context.journey || {}),
      'ذاكرة شمس: ' + JSON.stringify(context.memory),
      'آخر المحادثات: ' + JSON.stringify(context.history),
      'الصفحة الحالية: ' + clean(context.page, 100),
      'السلة الحالية: ' + JSON.stringify(Array.isArray(context.cart) ? context.cart.slice(0, 20) : []),
      'الأقسام المتاحة: ' + JSON.stringify(categoryCatalog),
      'كتالوج مختصر: ' + JSON.stringify(catalog),
      'رسالة العميل: ' + clean(context.message, 1200)
    ].join('\n');

    try {
      const result = await requestModel(prompt);
      const plan = jsonFromText(result);
      if (!plan || !Array.isArray(plan.toolCalls)) return null;
      const intent = normalizeIntent(plan.intent);
      const toolCalls = sanitizeToolCalls(
        plan.toolCalls.map(call => ({
          name: call?.name,
          args: parseToolArgs(call?.argsJson)
        }))
      );
      const toolDependent = new Set(['menu', 'navigate', 'recommend', 'cart', 'cart_summary', 'cart_add', 'order_status', 'product_info', 'product_search']);
      if (toolDependent.has(intent) && !toolCalls.length) return null;
      return {
        intent,
        reply: clean(plan.reply, 800),
        toolCalls,
        memory: plan.memory && typeof plan.memory === 'object' ? plan.memory : {},
        workflow: plan.workflow && typeof plan.workflow === 'object' ? safeWorkflowSlots(plan.workflow) : {}
      };
    } catch {
      return null;
    }
  }

  async function handle(input = {}) {
    const message = clean(input.message, 1200);
    if (!message) throw new Error('رسالة شمس فارغة.');

    const customer = input.customer || null;
    const customerContext = input.customerContext && typeof input.customerContext === 'object' ? input.customerContext : null;
    const identity = buildIdentity({ customer, sessionId: input.sessionId });
    let stage = 'understand';

    const memory = await memoryService.read(identity);
    stage = 'recall';

    const context = {
      message,
      customer,
      customerContext,
      sessionId: clean(input.sessionId, 120),
      page: clean(input.page, 120),
      cart: Array.isArray(input.cart) ? input.cart.slice(0, 20) : [],
      history: Array.isArray(input.history) ? input.history.slice(-10) : [],
      memory,
      journey: buildJourneyContext(customerContext, memory),
      dialect: detectDialect(message),
      normalizedMessage: normalizeDialectText(message)
    };

    const rememberWorkflow = async (reply, intent, journey, extraProducts = []) => {
      await memoryService.rememberTurn(identity, {
        user: message,
        assistant: reply,
        intent,
        products: extraProducts.length ? extraProducts : memory.recentProducts,
        journey,
        name: customer?.name || memory.name
      });
    };

    const confirmationDecision = workflowService?.confirmation?.(message);
    if (workflowService && pendingActionIsUsable(memory.pendingAction)) {
      if (confirmationDecision === true) {
        const executed = await workflowService.confirmPending({ identity, memory });
        if (executed) {
          const actions = executed.type === 'order'
            ? [{ type: 'navigate', url: '/track-order' }]
            : [];
          await rememberWorkflow(executed.reply, executed.type, {
            intent: executed.type,
            step: 'confirmed_and_executed',
            slots: {}
          });
          return {
            stage: 'learn',
            stages: STAGES,
            intent: executed.type,
            reply: executed.reply,
            actions,
            memory: {
              scope: identity.customerId ? 'customer' : 'session',
              remembered: true,
              preferences: memory.preferences
            }
          };
        }
      }

      if (confirmationDecision === false) {
        const cancelled = await workflowService.cancelPending(identity);
        await rememberWorkflow(cancelled.reply, memory.pendingAction.type, {
          intent: memory.pendingAction.type,
          step: 'cancelled',
          slots: {}
        });
        return {
          stage: 'learn',
          stages: STAGES,
          intent: memory.pendingAction.type,
          reply: cancelled.reply,
          actions: [],
          memory: {
            scope: identity.customerId ? 'customer' : 'session',
            remembered: true,
            preferences: memory.preferences
          }
        };
      }
    }

    const pendingType = pendingActionIsUsable(memory.pendingAction) ? memory.pendingAction.type : '';
    const semanticPlan = await modelPlan(context);
    const semanticIntent = normalizeIntent(semanticPlan?.intent);
    const normalizedMessage = normalizeDialectText(message);
    const navigationOnlyRequested = /(?:افتح|إفتح|روح|روّح|وديني|ودّيني|دخلني|ادخلني|انتقل|روحلي|روح لي|وريني|ورجيني|show|open|go to|navigate)\s+(?:الرئيسيه|الرئيسية|الصفحه الرئيسيه|الصفحة الرئيسية|المنيو|المنيو|القائمه|القائمة|الحجز|حجز|حجز طاوله|حجز طاولة|الطاولة|طاولة|السله|السلة|العربه|العربة|متابعه الطلب|متابعة الطلب|حاله الطلب|حالة الطلب|طلبي|تتبع الطلب|الفعاليات|فعاليات|التجارب|تجارب|الذكريات|ذكريات|الخصوصيه|الخصوصية|سياسه الخصوصيه|سياسة الخصوصية|home|menu|reservation|cart|track order|events|memories|privacy)\b/i.test(normalizedMessage);
    const reservationStatusRequested = !navigationOnlyRequested && (
      semanticIntent === 'reservation_status' ||
      /(حجزي|حجزى|موعدي|موعدى|الحجز بتاعي|الحجز تبعي|حجزي الجاي|عندي حجز|حجز عندي|بيانات الحجز)/i.test(normalizedMessage)
    );
    const reservationRequested = !navigationOnlyRequested && !reservationStatusRequested && !isNegatedAction(message, 'reservation') && (
      semanticIntent === 'reservation' ||
      /(احجز|حجز|طاولة|حاجز|موعد|بدي حجز|بدّي احجز|عايز احجز|عايز حجز)/i.test(normalizedMessage)
    );
    const orderRequested = !navigationOnlyRequested && !isNegatedAction(message, 'order') && (
      semanticIntent === 'order' ||
      /(اطلب|طلبلي|اطلبلي|بدّي طلب|بدي طلب|عايز طلب|عاوز طلب|اعمل طلب|سوّي طلب|سوي طلب|اوردر|checkout)/i.test(normalizedMessage)
    );

    if (reservationStatusRequested) {
      const upcoming = context.customerContext?.nextReservation || null;
      const reservationReply = upcoming
        ? 'حجزك القادم يوم ' + String(upcoming.date || '') + ' الساعة ' + String(upcoming.time || '') +
          ' لعدد ' + Number(upcoming.guests || 0) + ' أشخاص، وحالته ' + String(upcoming.status || 'قيد المعالجة') + '.'
        : customer
          ? 'ما عنديش حجز قادم ظاهر على حسابك حاليًا.'
          : 'سجّل دخولك أولًا علشان أقدر أجيب حجزك الحالي.';
      await rememberWorkflow(reservationReply, 'reservation_status', {
        intent: 'reservation_status',
        step: 'context_lookup',
        slots: {}
      });
      return {
        stage: 'learn',
        stages: STAGES,
        intent: 'reservation_status',
        reply: reservationReply,
        actions: [],
        memory: {
          scope: identity.customerId ? 'customer' : 'session',
          remembered: true,
          preferences: memory.preferences
        }
      };
    }

    if (workflowService && (reservationRequested || pendingType === 'reservation')) {
      const result = await workflowService.handleReservation({
        identity,
        message,
        memory,
        customer,
        hints: semanticPlan?.workflow || {}
      });
      await rememberWorkflow(result.reply, 'reservation', {
        intent: 'reservation',
        step: result.status,
        slots: safeWorkflowSlots(result.pending)
      });
      return {
        stage: 'learn',
        stages: STAGES,
        intent: 'reservation',
        reply: result.reply,
        actions: [],
        memory: {
          scope: identity.customerId ? 'customer' : 'session',
          remembered: true,
          preferences: memory.preferences
        }
      };
    }

    if (workflowService && (orderRequested || pendingType === 'order')) {
      const result = await workflowService.handleOrder({
        identity,
        message,
        memory,
        cart: context.cart,
        customer,
        hints: semanticPlan?.workflow || {}
      });
      await rememberWorkflow(result.reply, 'order', {
        intent: 'order',
        step: result.status,
        slots: safeWorkflowSlots(result.pending)
      });
      return {
        stage: 'learn',
        stages: STAGES,
        intent: 'order',
        reply: result.reply,
        actions: [],
        memory: {
          scope: identity.customerId ? 'customer' : 'session',
          remembered: true,
          preferences: memory.preferences
        }
      };
    }

    stage = 'plan';
    const localPlan = buildSmartLocalPlan({
      message,
      memory,
      products: products(),
      categories: categories(),
      cart: context.cart,
      page: context.page,
      customerContext: context.customerContext
    }) || detectLocalPlan({
      message,
      memory,
      products: products(),
      customerContext: context.customerContext
    });
    const model = navigationOnlyRequested ? localPlan : (semanticPlan || localPlan);
    const plan = model || localPlan;
    const intent = normalizeIntent(plan.intent);

    stage = 'execute';
    const toolResults = [];
    const clientActions = [];
    for (const call of Array.isArray(plan.toolCalls) ? plan.toolCalls.slice(0, MAX_TOOL_CALLS) : []) {
      const result = await toolExecute(call.name, call.args, { ...context, intent });
      toolResults.push({ name: call.name, result });
      if (result?.clientAction) clientActions.push(result.clientAction);
    }

    stage = 'verify';
    const verifiedActions = clientActions.filter(action => {
      if (action.type === 'navigate') return Boolean(resolveNavigation({ path: action.url }, products()));
      if (action.type === 'cart.add') {
        return action.product?.id && Number(action.quantity) >= 1 && Number(action.quantity) <= 20;
      }
      return false;
    });

    const failedTool = toolResults.find(item => item.result?.error);
    const responseData = {
      journey: context.journey,
      recommendations: toolResults.find(item => item.name === 'recommend_menu')?.result?.recommendations || [],
      matches: toolResults.find(item => item.name === 'search_menu')?.result?.matches || [],
      cartSummary: toolResults.find(item => item.name === 'cart_summary')?.result?.cartSummary || toolResults.find(item => item.name === 'cart_summary')?.result || null,
      added: toolResults.find(item => item.name === 'cart_add')?.result?.added,
      order: toolResults.find(item => item.name === 'get_order_status')?.result?.order
    };

    responseData.navigationOpened = verifiedActions.some(action => action.type === 'navigate');
    responseData.menuOpened = verifiedActions.some(action => action.type === 'navigate' && action.url === '/menu');
    responseData.cartOpened = verifiedActions.some(action => action.type === 'navigate' && action.url === '/cart');
    responseData.eventsOpened = verifiedActions.some(action => action.type === 'navigate' && action.url === '/events');
    responseData.memoriesOpened = verifiedActions.some(action => action.type === 'navigate' && action.url === '/memories');

    let reply = failedTool?.result?.error || buildLocalReply(intent, responseData);

    if (!reply && !toolResults.length) {
      reply = clean(plan.reply, 800);
    }

    if (intent === 'cart_add' && !responseData.added && !failedTool) {
      reply = 'لم يتم تنفيذ الإضافة. قل لي اسم الطبق وسأحاول مرة أخرى.';
    }

    if (intent === 'order_status' && !responseData.order && !failedTool && !verifiedActions.length) {
      reply = 'أحتاج رقم الطلب المرتبط بحسابك لعرض حالته صوتيًا.';
    }

    if (!reply) reply = journeyAwareUnknownReply(customer, context.journey);

    stage = 'respond';
    stage = 'learn';

    const recentProducts = [];
    for (const result of toolResults) {
      const rows = result.result?.recommendations || result.result?.matches || [];
      for (const item of rows.slice(0, 6)) {
        recentProducts.push({
          id: String(item.id),
          nameAr: clean(item.nameAr, 120),
          price: Number(item.price || 0)
        });
      }
      const addedItem = result.result?.added;
      if (addedItem?.id) {
        recentProducts.push({
          id: String(addedItem.id),
          nameAr: clean(addedItem.nameAr || addedItem.nameEn, 120),
          price: Number(addedItem.price || 0)
        });
      }
    }
    const memoryPatch = {
      lastIntent: intent,
      name: customer?.name || memory.name,
      journey: {
        intent,
        step: verifiedActions.length ? 'action_executed' : 'conversation',
        slots: plan.memory && typeof plan.memory === 'object' ? {
          budgetAed: plan.memory.budgetAed ?? '',
          spicy: typeof plan.memory.spicy === 'boolean' ? plan.memory.spicy : '',
          vegetarian: typeof plan.memory.vegetarian === 'boolean' ? plan.memory.vegetarian : ''
        } : {},
        stage: context.journey.stage || '',
        nextBestAction: context.journey.nextBestAction || ''
      }
    };
    if (plan.memory?.budgetAed !== undefined || plan.memory?.spicy !== undefined || plan.memory?.vegetarian !== undefined) {
      const preferences = { ...memory.preferences };
      if (plan.memory.budgetAed !== undefined) preferences.budgetAed = plan.memory.budgetAed;
      if (plan.memory.spicy !== undefined) preferences.spicy = plan.memory.spicy;
      if (plan.memory.vegetarian !== undefined) preferences.vegetarian = plan.memory.vegetarian;
      memoryPatch.preferences = preferences;
    }

    await memoryService.rememberTurn(identity, {
      user: message,
      assistant: reply,
      intent,
      products: recentProducts.length ? recentProducts : memory.recentProducts,
      journey: memoryPatch.journey,
      name: memoryPatch.name
    });

    return {
      stage,
      stages: STAGES,
      intent,
      reply,
      actions: verifiedActions,
      memory: {
        scope: identity.customerId ? 'customer' : 'session',
        remembered: true,
        preferences: memoryPatch.preferences || memory.preferences
      }
    };
  }

  return { handle, stages: STAGES };
}
