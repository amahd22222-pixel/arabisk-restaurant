const ARABIC_DIGITS = Object.freeze({
  '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'
});

const DIALECT_ALIASES = Object.freeze([
  ['بدّي','بدي'], ['بدى','بدي'], ['حابب','عايز'], ['حابه','عايز'], ['حاب','عايز'],
  ['نفسي','عايز'], ['ممكن','عايز'], ['عاوز','عايز'], ['شو','ايه'], ['إيش','ايه'],
  ['ايش','ايه'], ['وين','فين'], ['هلق','دلوقتي'], ['هلأ','دلوقتي'], ['هلاء','دلوقتي'],
  ['هيدا','ده'], ['هيدي','دي'], ['هالطبق','الطبق ده'], ['هالشي','الشي ده'],
  ['هال','ده'], ['مو','مش'], ['كتير','اوي'], ['فيك','تقدر'], ['فيني','اقدر'],
  ['فينا','نقدر'], ['كرمال','عشان'], ['مشان','عشان'], ['هيك','كده'], ['لسا','لسه']
]);

const STOPWORDS = new Set([
  'من','في','على','الى','إلى','عن','مع','هذا','هذه','ده','دي','هيدا','هيدي','هال',
  'اللي','الي','انا','أنا','انت','إنت','انتي','إنتي','هو','هي','هم','همه','و','يا',
  'لو','بس','عايز','بدي','بدى','نفسي','ممكن','ايه','فين'
]);

const clean = (value, max = 1200) => String(value ?? '').trim().slice(0, max);

export function normalizeArabic(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ar')
    .replace(/[٠-٩]/g, digit => ARABIC_DIGITS[digit])
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

export function normalizeDialect(value) {
  let text = normalizeArabic(value);
  for (const [from, to] of DIALECT_ALIASES) {
    text = text.replace(new RegExp('(?:' + normalizeArabic(from) + ')', 'g'), normalizeArabic(to));
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function detectDialect(value) {
  const raw = normalizeArabic(value);
  if (!raw) return 'gulf';
  if (/(هيدا|هيدي|هال|شو|كتير|فيك|فينا|عنجد|كرمال|مشان)/.test(raw)) return 'lebanese';
  if (/(هلق|هلأ|لسا|شلون|شو|كتير|بدي|مو|هيك|مشان)/.test(raw)) return 'syrian';
  if (/(عايز|عاوز|نفسي|ايه|فين|دلوقتي|كده|ليه|مش|احنا|اوي|ازاي|بتاع)/.test(raw)) return 'egyptian';
  return 'gulf';
}

function significantTokens(value) {
  return normalizeDialect(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

function editDistance(a, b, limit = 4) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function tokenSimilarity(queryToken, candidateToken) {
  if (queryToken === candidateToken) return 1;
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return 0.86;
  const maxLength = Math.max(queryToken.length, candidateToken.length);
  const limit = maxLength <= 4 ? 1 : maxLength <= 7 ? 2 : 3;
  const distance = editDistance(queryToken, candidateToken, limit);
  if (distance > limit) return 0;
  return Math.max(0, 1 - distance / maxLength);
}

function productHaystack(product) {
  return normalizeDialect([
    product?.nameAr,
    product?.nameEn,
    product?.descriptionAr,
    product?.descriptionEn,
    product?.categorySlug,
    product?.categoryId,
    product?.categoryNameAr,
    product?.categoryNameEn,
    ...(Array.isArray(product?.tags) ? product.tags : []),
    ...(Array.isArray(product?.aliases) ? product.aliases : [])
  ].join(' '));
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

function categoryHaystack(category) {
  return normalizeDialect([
    category?.id,
    category?.nameAr,
    category?.nameEn,
    category?.slug,
    ...(Array.isArray(category?.aliases) ? category.aliases : [])
  ].join(' '));
}

function rankCategories(categories, query, limit = 3) {
  const normalizedQuery = normalizeDialect(query);
  const tokens = significantTokens(query);
  if (!normalizedQuery || !Array.isArray(categories)) return [];

  return categories
    .filter(category => category?.active !== false)
    .map(category => {
      const haystack = categoryHaystack(category);
      const hayTokens = significantTokens(haystack);
      let score = 0;
      if (haystack === normalizedQuery) score += 40;
      else if (haystack.includes(normalizedQuery)) score += 24;
      for (const token of tokens) {
        let best = 0;
        for (const candidate of hayTokens) best = Math.max(best, tokenSimilarity(token, candidate));
        if (best >= 0.99) score += 9;
        else if (best >= 0.84) score += 6;
        else if (best >= 0.68) score += 3;
      }
      return { category, score };
    })
    .filter(row => row.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(row => row.category);
}

function resolveCategory(raw, categories) {
  const ranked = rankCategories(categories, raw, 3);
  return ranked[0] || null;
}

function categoryProducts(catalog, category) {
  if (!category?.id || !Array.isArray(catalog)) return [];
  const key = String(category.id);
  return catalog
    .filter(product => String(product?.categoryId) === key && product?.available !== false)
    .sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
}

export function rankProducts(products, query, limit = 6) {
  const normalizedQuery = normalizeDialect(query);
  const queryTokens = significantTokens(query);
  if (!normalizedQuery || !Array.isArray(products)) return [];

  return products
    .map(product => {
      const haystack = productHaystack(product);
      const candidateTokens = significantTokens(haystack);
      const compact = candidateTokens.join(' ');
      let score = 0;

      if (haystack === normalizedQuery) score += 40;
      else if (haystack.includes(normalizedQuery)) score += 24;
      if (normalizedQuery.length >= 4 && compact.includes(normalizedQuery)) score += 8;

      for (const token of queryTokens) {
        let best = 0;
        for (const candidate of candidateTokens) best = Math.max(best, tokenSimilarity(token, candidate));
        if (best >= 0.99) score += 9;
        else if (best >= 0.84) score += 6;
        else if (best >= 0.68) score += 3;
      }

      if (product?.chefChoice) score += 1;
      if (product?.isNew) score += 0.5;
      return { product, score };
    })
    .filter(row => row.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(row => row.product);
}

export function extractPreferences(text) {
  const raw = normalizeDialect(text);
  const preferences = {};

  if (/(مش حار|مو حار|بدون حار|غير حار|ما بدي حار|مش سبايسي|مو سبايسي)/i.test(raw)) preferences.spicy = false;
  else if (/(حار|سبايسي|spicy)/i.test(raw)) preferences.spicy = true;

  if (/(مش نباتي|مو نباتي|مش vegan|مو vegan)/i.test(raw)) preferences.vegetarian = false;
  else if (/(نباتي|نباتيه|vegetarian|vegan)/i.test(raw)) preferences.vegetarian = true;

  if (/(حلو|حلويات|تحليه|تحلية|ديسرت|dessert|سكر|شوكولاته|كيك|ايس كريم)/i.test(raw)) preferences.taste = 'sweet';
  else if (/(مالح|حادق|اكل|أكل|وجبه|وجبة)/i.test(raw)) preferences.taste = 'savory';

  if (/(خفيف|خفيفه|خفيفا|لايت|light)/i.test(raw)) preferences.weight = 'light';
  else if (/(مشبع|دسم|تقيل|ثقيل|وجبه كامله)/i.test(raw)) preferences.weight = 'hearty';

  if (/(مشروب|مشروبات|شراب|عصير|قهوه|قهوة|شاي|لاتيه|كوفي|drink)/i.test(raw)) preferences.category = 'drink';
  if (/(دجاج|فراخ|chicken)/i.test(raw)) preferences.protein = 'chicken';
  if (/(لحمه|لحمة|لحم|ستيك|beef|meat)/i.test(raw)) preferences.protein = 'beef';
  if (/(سمك|بحري|جمبري|روبيان|seafood|fish|shrimp)/i.test(raw)) preferences.protein = 'seafood';

  const budget = raw.match(/(?:حدي|ميزانيتي|ميزانيه|لحد|حتى|تحت|اقل من|أقل من)\s*(\d{2,4})/) ||
    raw.match(/(\d{2,4})\s*(?:درهم|aed|د)/i);
  if (budget) {
    const value = Number(budget[1]);
    if (value > 0 && value <= 10000) preferences.budgetAed = value;
  }

  return preferences;
}

function parseQuantity(text) {
  const raw = normalizeArabic(text);
  const digit = raw.match(/(?:عدد|كمية|كم)\s*(\d{1,2})/) ||
    raw.match(/(?:\b|x|×)(\d{1,2})(?:\b)/);
  if (digit) {
    const value = Number(digit[1]);
    if (value >= 1 && value <= 20) return value;
  }

  const words = [
    [/عشرين/i, 20], [/تسعتاشر|تسعة عشر/i, 19], [/تمنتاشر|ثمانية عشر/i, 18],
    [/سبعتاشر|سبعة عشر/i, 17], [/ستاشر|ستة عشر/i, 16], [/خمستاشر|خمسة عشر/i, 15],
    [/اربعتاشر|أربعة عشر/i, 14], [/تلتاشر|ثلاثة عشر|ثلاثه عشر/i, 13],
    [/اتناشر|اثنا عشر|اثني عشر/i, 12], [/حداشر|أحد عشر/i, 11], [/عشرة|عشر/i, 10],
    [/تسعة|تسع/i, 9], [/ثمانية|تمانية|تمنية|ثماني/i, 8], [/سبعة|سبع/i, 7],
    [/ستة|سته|ست/i, 6], [/خمسة|خمسه|خمس/i, 5], [/أربعة|اربعه|اربعة|أربع/i, 4],
    [/ثلاثة|ثلاثه|تلاتة|ثلاث/i, 3], [/اتنين|اثنين|اثنان|ثنتين|شخصين/i, 2],
    [/واحد|وحدة|حبه|حبة/i, 1]
  ];
  for (const [pattern, value] of words) {
    if (pattern.test(raw)) return value;
  }
  return 1;
}

function referenceIndex(raw) {
  if (/(الرابع|رابع واحد|رقم 4)/i.test(raw)) return 3;
  if (/(التالت|الثالث|تالت واحد|رقم 3)/i.test(raw)) return 2;
  if (/(التاني|الثاني|تاني واحد|رقم 2)/i.test(raw)) return 1;
  if (/(الاول|الأول|اول واحد|رقم 1)/i.test(raw)) return 0;
  return -1;
}

function isReference(raw) {
  return referenceIndex(raw) >= 0 ||
    /(ده|دي|هيدا|هيدي|هالطبق|الطبق ده|الطبق دي|نفسه|نفسها|نفس الطبق|اللي فات|السابق|اللي قبله|اللي قبلي|كمان واحد|واحد كمان)/i.test(raw);
}

function isAddRequest(raw) {
  return /(ضيف|اضف|حط|زود|زيد|ضيفلي|اضفلي|حطلي|زودلي|زيدلي|دخل|سجل)/i.test(raw);
}

function isRecommendationRequest(raw) {
  return /(رشح|رشحلي|رشح لي|اقترح|اقترحلي|انصحني|نصحني|شو بتنصحني|شو تقترح|شو بترشح|محتار|محتارة|اختار لي|اختارلي|اختيار|دلني|دُلني|عايز حاجة|عاوز حاجه|نفسي في|بدي شي|بدي اكل|شو اكل|شو آكل|ايه الاحسن|شو الاحسن|المفضل|المفضلة|المفضلي|اللي بحبه|اللي بحبو|اللي باخده دايم|اللي باخدو دايم|زي اللي فات|زي المرة اللي فاتت|نفس اللي بطلبه|نفس طلباتي|عادتي|what.*recommend)/i.test(raw);
}

export function isNegatedAction(text, action) {
  const raw = normalizeDialect(text);
  if (action === 'reservation') {
    return /(?:مش|مو|ما|مابي|ما بدي|مش عايز|مش عاوز|مو عايز|مو عاوز).{0,20}(?:احجز|حجز|طاولة|موعد)/i.test(raw);
  }
  if (action === 'order') {
    return /(?:مش|مو|ما|مابي|ما بدي|مش عايز|مش عاوز|مو عايز|مو عاوز).{0,20}(?:اطلب|طلب|اوردر|order|checkout)/i.test(raw);
  }
  return false;
}

function latestCatalogProduct(memory, catalog) {
  const latest = Array.isArray(memory?.recentProducts) ? memory.recentProducts.at(-1) : null;
  if (!latest) return null;
  return catalog.find(product => String(product.id) === String(latest.id)) || latest;
}

function resolveReference(raw, ranked, memory, catalog) {
  const index = referenceIndex(raw);
  if (index >= 0) {
    if (ranked[index]) return ranked[index];
    const recent = Array.isArray(memory?.recentProducts) ? memory.recentProducts[index] : null;
    if (recent) return catalog.find(product => String(product.id) === String(recent.id)) || recent;
  }

  if (/(اللي فات|السابق|اللي قبله|اللي قبلي)/i.test(raw)) {
    const recent = Array.isArray(memory?.recentProducts) ? memory.recentProducts.at(-2) : null;
    if (recent) return catalog.find(product => String(product.id) === String(recent.id)) || recent;
  }

  if (/(ده|دي|هيدا|هيدي|هالطبق|الطبق ده|الطبق دي|نفسه|نفسها|نفس الطبق|كمان واحد|واحد كمان)/i.test(raw)) {
    return latestCatalogProduct(memory, catalog) || ranked[0] || null;
  }

  return ranked[0] || null;
}

function recommendationArgs(preferences, categoryId = '') {
  const args = Object.fromEntries(
    Object.entries(preferences).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  if (categoryId) args.categoryId = String(categoryId);
  return args;
}


function resolvePageMenuContext(page, categories, catalog) {
  const raw = String(page ?? '').split('?')[0].replace(/\/$/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] !== 'menu' || parts.length < 2) return { category: null, product: null, products: [] };

  const categoryKey = decodeURIComponent(parts[1]);
  const category = (Array.isArray(categories) ? categories : []).find(item =>
    normalizeDialect(item?.id) === normalizeDialect(categoryKey) ||
    normalizeDialect(item?.nameAr) === normalizeDialect(categoryKey) ||
    normalizeDialect(item?.nameEn) === normalizeDialect(categoryKey)
  ) || null;

  if (!category) return { category: null, product: null, products: [] };

  const categoryItems = categoryProducts(catalog, category);
  if (parts.length < 3) return { category, product: null, products: categoryItems };

  const productKey = decodeURIComponent(parts[2]);
  const product = categoryItems.find(item =>
    String(item.id).toLowerCase() === productKey.toLowerCase() ||
    normalizeDialect(item.nameAr) === normalizeDialect(productKey) ||
    normalizeDialect(item.nameEn) === normalizeDialect(productKey)
  ) || null;

  return { category, product, products: categoryItems };
}

function resolveStaticPage(raw) {
  const query = normalizeDialect(raw)
    .replace(/^(افتح|إفتح|روح|روّح|وديني|ودّيني|دخلني|ادخلني|انتقل|روحلي|روح لي|وريني|ورجيني|show|open|go to|navigate)\s+/i, '')
    .trim();

  if (/^(الرئيسيه|الرئيسية|الصفحة الرئيسية|الصفحه الرئيسيه|home)$/i.test(query)) return '/';
  if (/^(منيو|المنيو|القائمه|القائمة|menu)$/i.test(query)) return '/menu';
  if (/^(حجز|الحجز|حجز طاوله|حجز طاولة|الطاولة|طاولة|reservation)$/i.test(query)) return '/reservation';
  if (/^(السله|السلة|العربه|العربة|cart)$/i.test(query)) return '/cart';
  if (/^(متابعه الطلب|متابعة الطلب|حاله الطلب|حالة الطلب|طلبي|تتبع الطلب|track order)$/i.test(query)) return '/track-order';
  if (/^(الفعاليات|فعاليات|التجارب|تجارب|events)$/i.test(query)) return '/events';
  if (/^(الذكريات|ذكريات|memories)$/i.test(query)) return '/memories';
  if (/^(الخصوصيه|الخصوصية|سياسه الخصوصيه|سياسة الخصوصية|privacy)$/i.test(query)) return '/privacy';
  return '';
}

export function buildSmartLocalPlan({ message, memory = {}, products = [], categories = [], cart = [], page = '/', customerContext = null, live = null } = {}) {
  const text = clean(message);
  const raw = normalizeDialect(text);
  if (!raw) return null;

  const catalog = Array.isArray(products) ? products.filter(product => product?.available !== false) : [];
  const ranked = rankProducts(catalog, text, 6);
  const preferences = extractPreferences(text);
  const latest = latestCatalogProduct(memory, catalog);
  const pageContext = resolvePageMenuContext(page, categories, catalog);

  const livePage = live?.currentPage || {};
  const liveCart = live?.cart || {
    hasItems: Array.isArray(cart) && cart.length > 0,
    itemCount: Array.isArray(cart) ? cart.reduce((sum, item) => sum + (Number(item?.quantity || item?.qty) || 1), 0) : 0,
    items: Array.isArray(cart) ? cart.slice(0, 8) : []
  };

  if (
    livePage.area === 'cart' &&
    liveCart.hasItems &&
    /(?:ايه رايك|إيه رايك|ايه رأيك|إيه رأيك|شو رايك|شو رأيك|رأيك|قيم|قيّم|كويس|حلوين|مناسبين)/i.test(raw)
  ) {
    return {
      intent: 'cart_summary',
      confidence: 0.94,
      toolCalls: [{ name: 'cart_summary', args: {} }]
    };
  }

  if (
    pageContext.product &&
    /(?:تفاصيل|مكونات|مكوناته|مكوناتها|احكيلي عنه|قولي عنه|شو هو|ايه هو|ايه ده|شو هيدا|شو هيدي)/i.test(raw) &&
    !isAddRequest(raw)
  ) {
    return {
      intent: 'product_info',
      confidence: 0.94,
      toolCalls: [{
        name: 'product_info',
        args: { productId: String(pageContext.product.id) }
      }],
      reply: 'أكيد، أقول لك تفاصيل ' + (pageContext.product.nameAr || pageContext.product.nameEn) + '.'
    };
  }

  if (
    pageContext.category &&
    isRecommendationRequest(raw) &&
    !Object.keys(preferences).length
  ) {
    return {
      intent: 'recommend',
      confidence: 0.93,
      toolCalls: [{
        name: 'recommend_menu',
        args: recommendationArgs(preferences, pageContext.category.id)
      }]
    };
  }

  if (/^(السلام عليكم|السلام|اهلا|اهلين|يا هلا|هلا|مرحبا|مرحبتين|هاي|hello|hi|ازيك|ازيكم)/i.test(raw)) {
    const journeyStage = customerContext?.journey?.stage || '';
    const greeting = journeyStage === 'upcoming_reservation'
      ? 'أهلاً يا ' + (memory.name || 'صديقي') + '، نورت ARABISK. عندك زيارة قريبة وأنا جاهزة أساعدك.'
      : journeyStage === 'returning_favorite'
        ? 'أهلاً يا ' + (memory.name || 'صديقي') + '، نورت تاني. أقدر أرجع لك اختياراتك المفضلة.'
        : journeyStage === 'reengagement'
          ? 'نورت تاني يا ' + (memory.name || 'صديقي') + '. خلينا نشوف إيه اللي يناسبك النهارده.'
          : memory.name
            ? 'أهلاً يا ' + memory.name + '، نورت ARABISK. أنا شمس، معاك علشان أساعدك.'
            : 'أهلاً بيك في ARABISK. أنا شمس، معاك علشان أساعدك.';
    return {
      intent: 'greeting',
      confidence: 0.99,
      reply: greeting
    };
  }

  if (isNegatedAction(raw, 'reservation') || isNegatedAction(raw, 'order')) {
    return {
      intent: 'unknown',
      confidence: 0.94,
      reply: 'تمام، مش هأنفذ العملية دي. قل لي إيه اللي تحب تعمله بدلها.'
    };
  }

  if (/(حجزي|حجزى|موعدي|موعدى|الحجز بتاعي|الحجز تبعي|حجزي الجاي|عندي حجز|حجز عندي|بيانات الحجز)/i.test(raw)) {
    return {
      intent: 'reservation_status',
      confidence: 0.98,
      reply: 'هراجع لك حجزك الحالي.'
    };
  }

  const matchedCategory = resolveCategory(raw, categories);
  const navigationQuery = raw
    .replace(/^(افتح|إفتح|روح|روّح|وديني|ودّيني|دخلني|ادخلني|انتقل|روحلي|روح لي|وريني|ورجيني|show|open|go to|navigate)\s+/i, '')
    .trim();
  const matchedCategoryExact = matchedCategory && (
    normalizeDialect(matchedCategory.nameAr) === navigationQuery ||
    normalizeDialect(matchedCategory.nameEn) === navigationQuery ||
    normalizeDialect(matchedCategory.id) === navigationQuery
  );
  const explicitAnyChoice = /(اي صنف|أي صنف|اي حاجة|أي حاجة|اختارلي|اختاريلي|اختار لي|اختاري لي|اي حاجه|أي حاجه|حاجه|حاجة|شي|شيء)/i.test(raw);
  const pageNavigationRequested = /(افتح|إفتح|روح|روّح|وديني|ودّيني|دخلني|ادخلني|انتقل|روحلي|روح لي|وريني|ورجيني|show|open|go to|navigate)/i.test(raw);

  if (isAddRequest(raw)) {
    const referencePool = pageContext.products.length ? pageContext.products : ranked;
    const product = (
      pageContext.product && isReference(raw)
        ? pageContext.product
        : resolveReference(raw, referencePool, memory, catalog)
    );
    const categoryFallback = matchedCategory && (!product || (product.categoryId !== matchedCategory.id));
    const categoryCandidates = categoryFallback ? categoryProducts(catalog, matchedCategory) : [];
    const selectedCategoryProduct = explicitAnyChoice && categoryCandidates.length
      ? categoryCandidates[0]
      : (!product && categoryCandidates.length === 1 ? categoryCandidates[0] : null);
    const selectedProduct = selectedCategoryProduct || product;
    if (selectedProduct?.id) {
      return {
        intent: 'cart_add',
        confidence: ranked.length || categoryFallback ? 0.95 : 0.9,
        toolCalls: [{
          name: 'cart_add',
          args: { productId: String(selectedProduct.id), quantity: parseQuantity(text) }
        }],
        reply: 'حاضر، أضيف لك ' + (selectedProduct.nameAr || selectedProduct.nameEn || 'الطبق') + '.'
      };
    }

    if (matchedCategory && !explicitAnyChoice && categoryCandidates.length > 1 && !product) {
      return {
        intent: 'category_selection',
        confidence: 0.9,
        reply: 'تمام. في قسم ' + (matchedCategory.nameAr || matchedCategory.nameEn) + ' أكثر من صنف. قل لي اسم الصنف، أو قل "اختار لي أي صنف" وأنا أضيف أول اختيار متاح.'
      };
    }
    if (Object.keys(preferences).length) {
      return {
        intent: 'recommend',
        confidence: 0.86,
        toolCalls: [{ name: 'recommend_menu', args: recommendationArgs(preferences) }]
      };
    }
    return {
      intent: 'cart_add',
      confidence: 0.82,
      reply: 'أكيد. قل لي اسم الطبق أو صفه لي، وأنا أحدده لك قبل الإضافة.'
    };
  }

  if (matchedCategoryExact && pageNavigationRequested && !/(منيو|القائمة)/i.test(raw)) {
    return {
      intent: 'navigate',
      confidence: 0.94,
      toolCalls: [{
        name: 'navigate',
        args: { categoryId: String(matchedCategory.id) }
      }],
      reply: 'أكيد، أفتح لك قسم ' + (matchedCategory.nameAr || matchedCategory.nameEn) + ' الآن.'
    };
  }

  const matchedProduct = pageContext.product || ranked[0] || resolveReference(raw, pageContext.products.length ? pageContext.products : ranked, memory, catalog);
  if (matchedProduct?.id && pageNavigationRequested && !/(منيو|القائمة|السلة|العربة|الحجز|فعالي|ذكريات)/i.test(raw)) {
    return {
      intent: 'navigate',
      confidence: 0.9,
      toolCalls: [{
        name: 'navigate',
        args: {
          categoryId: String(matchedProduct.categoryId || ''),
          productId: String(matchedProduct.id)
        }
      }],
      reply: 'أكيد، أفتح لك ' + (matchedProduct.nameAr || matchedProduct.nameEn) + ' الآن.'
    };
  }

  const staticPage = pageNavigationRequested ? resolveStaticPage(raw) : '';
  if (staticPage) {
    return {
      intent: 'navigate',
      confidence: 0.97,
      toolCalls: [{ name: 'navigate', args: { path: staticPage } }],
      reply: 'أكيد، أفتح لك الصفحة المطلوبة الآن.'
    };
  }

  if (isRecommendationRequest(raw) || Object.keys(preferences).length) {
    return {
      intent: 'recommend',
      confidence: 0.9,
      toolCalls: [{
        name: 'recommend_menu',
        args: recommendationArgs(preferences)
      }]
    };
  }

  if (/(منيو|القائمة|الأكل|الاكل|الأطباق|الاطباق|شو عنا|شو عندكم|شو موجود|جيبلي.*منيو|افتح.*منيو|شوف.*منيو)/i.test(raw)) {
    return {
      intent: 'menu',
      confidence: 0.96,
      toolCalls: [{ name: 'navigate', args: { path: '/menu' } }],
      reply: 'أكيد، أفتح لك المنيو الآن.'
    };
  }

  if (/(السلة|العربة|شو بالسلة|شو عندي بالسلة|cart)/i.test(raw)) {
    const asksSummary = /(فيها|موجود|محتوى|محتويات|المجموع|الإجمالي|اجمالي|بكام|كام|اعرض|وريني|شوف|شو)/i.test(raw);
    return asksSummary
      ? { intent: 'cart_summary', confidence: 0.97, toolCalls: [{ name: 'cart_summary', args: {} }] }
      : { intent: 'cart', confidence: 0.96, toolCalls: [{ name: 'navigate', args: { path: '/cart' } }], reply: 'حاضر، أفتح لك السلة.' };
  }

  if (/(متابعة|تتبع|حالة الطلب|طلبي|وين طلبي|شو صار بطلب|order status|track order|order)/i.test(raw)) {
    const orderMatch = raw.match(/\bO\d{5}\b/i);
    if (orderMatch) {
      return { intent: 'order_status', confidence: 0.98, toolCalls: [{ name: 'get_order_status', args: { orderId: orderMatch[0].toUpperCase() } }] };
    }
    return { intent: 'order_status', confidence: 0.91, toolCalls: [{ name: 'navigate', args: { path: '/track-order' } }], reply: 'أفتح لك متابعة الطلب.' };
  }

  if (/(فعالي|تجارب|حدث|شو في فعاليات|شو في تجربة|events)/i.test(raw)) {
    return { intent: 'events', confidence: 0.96, toolCalls: [{ name: 'navigate', args: { path: '/events' } }], reply: 'أفتح لك التجارب والفعاليات.' };
  }

  if (/(ذكريات|صورنا|فيديوهاتنا|فديوهاتنا|ذكرياتي|memories)/i.test(raw)) {
    return { intent: 'memories', confidence: 0.96, toolCalls: [{ name: 'navigate', args: { path: '/memories' } }], reply: 'أفتح لك ذكريات ARABISK.' };
  }

  if (/(ايه ده|ايه دي|ده ايه|دي ايه|شو هيدا|شو هيدي|شو هالطبق|مكونات|مكوناته|مكوناتها|السعر كام|بكام ده|بكام دي|قد ايه|قديش سعر)/i.test(raw) && (latest || ranked[0])) {
    const product = latest || ranked[0];
    const name = product.nameAr || product.nameEn || 'الطبق';
    const price = Number(product.price || 0);
    const description = clean(product.descriptionAr || product.descriptionEn, 180);
    const parts = [name];
    if (price > 0) parts.push('سعره ' + price + ' درهم');
    if (description) parts.push(description);
    return {
      intent: 'product_search',
      confidence: 0.93,
      reply: parts.join('، ') + '.'
    };
  }

  if (isReference(raw) && !isAddRequest(raw) && latest) {
    const product = resolveReference(raw, ranked, memory, catalog);
    if (product) {
      const name = product.nameAr || product.nameEn || 'الطبق';
      const price = Number(product.price || 0);
      return {
        intent: 'product_search',
        confidence: 0.87,
        reply: price > 0 ? 'تقصد ' + name + '، وسعره ' + price + ' درهم.' : 'تقصد ' + name + '.'
      };
    }
  }

  if (/(جعان|جوعان|جوعانة|عايز اكل|عايز آكل|نفسي اكل|بدي اكل|شو اكل|شو آكل|اكل ايه|آكل ايه|what.*eat)/i.test(raw)) {
    return {
      intent: 'recommend',
      confidence: 0.86,
      toolCalls: [{ name: 'recommend_menu', args: recommendationArgs(preferences) }]
    };
  }

  if (page === '/menu' && /(اه|تمام|كمل|وريني|هات|هاتلي)/i.test(raw)) {
    return {
      intent: 'recommend',
      confidence: 0.65,
      toolCalls: [{ name: 'recommend_menu', args: recommendationArgs(preferences) }]
    };
  }

  return null;
}

export const __test = Object.freeze({
  normalizeArabic,
  normalizeDialect,
  detectDialect,
  rankProducts,
  extractPreferences,
  isNegatedAction,
  buildSmartLocalPlan
});
