const MAX_MESSAGE = 1200;
const MAX_HISTORY_ITEMS = 12;
const MAX_PRODUCTS_IN_CONTEXT = 24;
const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';

class ShamsServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ShamsServiceError';
    this.status = status;
  }
}

const clean = (value, max = MAX_MESSAGE) => String(value ?? '').trim().slice(0, max);

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map(item => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: clean(item?.content, MAX_MESSAGE)
    }))
    .filter(item => item.content);
}

function findProductMatches(products, message) {
  const query = String(message || '').toLocaleLowerCase('ar');
  return products
    .filter(product => {
      const haystack = [product.nameAr, product.nameEn, product.descriptionAr, product.descriptionEn, product.categorySlug]
        .join(' ')
        .toLocaleLowerCase('ar');
      return haystack && query && haystack.split(/\s+/).some(token => token.length >= 3 && query.includes(token));
    })
    .slice(0, 4);
}

function buildMenuContext(repository) {
  const products = repository.products.all().filter(item => item?.available !== false);
  return products.slice(0, MAX_PRODUCTS_IN_CONTEXT).map(product => ({
    id: String(product.id || ''),
    nameAr: clean(product.nameAr, 120),
    nameEn: clean(product.nameEn, 120),
    price: Number(product.price || 0),
    categorySlug: clean(product.categorySlug, 80),
    chefChoice: product.chefChoice === true,
    isNew: product.isNew === true,
    tags: Array.isArray(product.tags) ? product.tags.slice(0, 8) : []
  }));
}

function buildLocalRecommendation(products, message) {
  const raw = String(message || '');
  const budgetMatch = raw.match(/(\\d{2,4})\\s*(?:درهم|د|aed)?/i);
  const budget = budgetMatch ? Number(budgetMatch[1]) : 0;
  const spicy = /(حار|حارة|سبايسي|spicy)/i.test(raw);
  const vegetarian = /(نبات|vegetarian|vegan)/i.test(raw);
  const candidates = products
    .filter(product => product?.available !== false)
    .filter(product => !budget || Number(product.price || 0) <= budget)
    .filter(product => !vegetarian || product.dietary?.includes?.('vegetarian') || product.dietary?.includes?.('vegan'))
    .filter(product => !spicy || product.tags?.includes?.('spicy') || Number(product.spiceLevel || 0) > 0);

  const ranked = candidates
    .map(product => ({
      product,
      score:
        (product.chefChoice ? 4 : 0) +
        (product.isNew ? 2 : 0) +
        (product.available !== false ? 1 : 0) -
        (budget ? Math.max(0, Number(product.price || 0) - budget) / Math.max(1, budget) : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.product);

  if (!ranked.length) {
    return {
      reply: 'أكيد ☀️ أقدر أساعدك نختار، لكن محتاج أعرف ميزانيتك أو هل تفضل شيء خفيف أم وجبة مشبعة.'
    };
  }

  const lines = ranked.map(product => `• ${product.nameAr || product.nameEn} — ${product.price} AED`);
  return {
    reply: `عندي لك ${ranked.length === 1 ? 'اختيار' : 'كم اختيار'} مناسب ☀️\\n${lines.join('\\n')}\\n\\nتحب أشوف لك تفاصيل أول اختيار؟`,
    actions: ranked[0]?.categorySlug
      ? [{ type: 'navigate', url: `/menu/${encodeURIComponent(ranked[0].categorySlug)}`, label: 'عرض الاختيارات' }]
      : []
  };
}

function localConcierge({ message, customer, repository }) {
  const raw = clean(message);
  const normalized = raw.toLocaleLowerCase('ar');
  const products = repository.products.all().filter(item => item?.available !== false);
  const matches = findProductMatches(products, raw);

  if (/\b(منيو|المنيو|القائمة|الأكل|اكل|أكل|الأطباق)\\b/i.test(normalized)) {
    return {
      reply: 'أكيد 🌞 أفتح لك المنيو الآن، وبعدها أقدر أساعدك تختار الطبق المناسب.',
      actions: [{ type: 'navigate', url: '/menu', label: 'فتح المنيو' }]
    };
  }

  if (/(حجز|احجز|طاولة|مطعم|موعد)/i.test(normalized)) {
    return {
      reply: customer?.name
        ? `أكيد يا ${customer.name} 🌞 أفتح لك صفحة الحجز ونكمل معك خطوة بخطوة.`
        : 'أكيد 🌞 أفتح لك صفحة الحجز ونكمل معك خطوة بخطوة.',
      actions: [{ type: 'navigate', url: '/reservation', label: 'حجز طاولة' }]
    };
  }

  if (/(السلة|العربة|cart)/i.test(normalized)) {
    return {
      reply: 'حاضر 🌞 أفتح لك السلة عشان تراجع طلبك.',
      actions: [{ type: 'navigate', url: '/cart', label: 'فتح السلة' }]
    };
  }

  if (/(طلب|الطلبات|متابعة|التتبع|order)/i.test(normalized)) {
    return {
      reply: 'أكيد 🌞 أقدر أوصلك إلى متابعة الطلبات.',
      actions: [{ type: 'navigate', url: '/track-order', label: 'متابعة الطلب' }]
    };
  }

  if (/(فعالي|مناسب|حدث|events)/i.test(normalized)) {
    return {
      reply: 'عندنا صفحة للتجارب والفعاليات القادمة 🌞 خليني أفتحها لك.',
      actions: [{ type: 'navigate', url: '/events', label: 'الفعاليات' }]
    };
  }

  if (/(ذكريات|صور|فيديو|فديو|memories)/i.test(normalized)) {
    return {
      reply: 'تعال نشوف لحظات ARABISK وذكريات المطعم 🌞',
      actions: [{ type: 'navigate', url: '/memories', label: 'الذكريات' }]
    };
  }

  if (/(نقاط|مكافآت|ولاء|rewards)/i.test(normalized)) {
    return {
      reply: 'ميزة المكافآت والولاء جزء من خطة ARABISK القادمة، وحاليًا أقدر أساعدك في الطلب والحجز والمنيو والفعاليات.'
    };
  }

  if (/(اختاري|اختار|محتار|محتارة|ساعديني أختار|ساعدني أختار|اختيار|choose|recommend)/i.test(normalized)) {
    return buildLocalRecommendation(products, raw);
  }

  if (matches.length) {
    const lines = matches.map(product => `• ${product.nameAr || product.nameEn} — ${product.price} AED`);
    return {
      reply: `وجدت لك خيارات قريبة من طلبك 🌞\\n${lines.join('\\n')}`,
      actions: matches[0]?.categorySlug
        ? [{ type: 'navigate', url: `/menu/${encodeURIComponent(matches[0].categorySlug)}`, label: 'عرض الخيارات' }]
        : []
    };
  }

  if (/^(السلام|هلا|اهلا|أهلا|مرحبا|هاي|hello|hi)/i.test(normalized)) {
    return {
      reply: customer?.name
        ? `أهلاً يا ${customer.name} ☀️ أنا شمس. قولي تحب أساعدك في إيه؟`
        : 'أهلاً بك في ARABISK ☀️ أنا شمس. قولي تحب أساعدك في إيه؟'
    };
  }

  return {
    reply: customer?.name
      ? `أنا شمس ☀️ معك في ARABISK يا ${customer.name}. أقدر أساعدك في المنيو، اختيار الأكل، الحجز، السلة، متابعة الطلب والفعاليات. جرّب قلّي: "شمس، ساعديني أختار".`
      : 'أنا شمس ☀️ معك في ARABISK. أقدر أساعدك في المنيو، اختيار الأكل، الحجز، السلة، متابعة الطلب والفعاليات. جرّب قلّي: "شمس، ساعديني أختار".'
  };
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const texts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) texts.push(part.text.trim());
    }
  }
  return texts.join('\\n').trim();
}

async function requestModel({ endpoint, apiKey, model, instructions, input }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      instructions,
      input
    }),
    signal: AbortSignal.timeout(15000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = clean(payload?.error?.message || 'AI provider request failed.', 220);
    const error = new ShamsServiceError('تعذر تشغيل شمس حاليًا.', 503);
    error.providerMessage = message;
    throw error;
  }

  const reply = extractResponseText(payload);
  if (!reply) throw new ShamsServiceError('لم تصل إجابة صالحة من محرك شمس.', 503);
  return reply;
}

export function createShamsService({
  repository,
  findCustomerByProfileToken,
  aiApiKey = '',
  aiModel = DEFAULT_MODEL,
  aiEndpoint = DEFAULT_ENDPOINT
}) {
  const apiKey = clean(aiApiKey, 300);
  const model = clean(aiModel || DEFAULT_MODEL, 80) || DEFAULT_MODEL;
  const endpoint = clean(aiEndpoint || DEFAULT_ENDPOINT, 300) || DEFAULT_ENDPOINT;

  const status = () => ({
    configured: Boolean(apiKey),
    provider: apiKey ? 'openai-compatible' : 'local-concierge',
    model: apiKey ? model : 'local'
  });

  async function chat({ message, history = [], profileToken = '' } = {}) {
    const text = clean(message);
    if (text.length < 1) throw new ShamsServiceError('اكتب رسالتك لشمس أولًا.');
    if (text.length > MAX_MESSAGE) throw new ShamsServiceError('رسالة شمس طويلة جدًا.');

    let customer = null;
    if (profileToken) {
      try {
        customer = findCustomerByProfileToken?.(profileToken) || null;
      } catch {
        customer = null;
      }
    }

    if (!apiKey) return localConcierge({ message: text, customer, repository });

    const menu = buildMenuContext(repository);
    const customerContext = customer
      ? {
          name: clean(customer.name, 80),
          appMember: customer.appMember === true,
          orderCount: Number(customer.orderCount || 0),
          reservationCount: Number(customer.reservationCount || 0)
        }
      : { appMember: false };

    const instructions = [
      'أنتِ شمس، المساعدة الرقمية الرسمية لمطعم ARABISK.',
      'تحدثي بالعربية الطبيعية وبأسلوب ضيافة راقٍ، دافئ، مختصر وعملي.',
      'لا تدّعي تنفيذ أي إجراء لم ينفذه الخادم. لا تختلق أسعارًا أو مواعيد أو منتجات.',
      'إذا لم تعرفي معلومة من السياق، قولي بوضوح إنك تحتاجين الرجوع للنظام.',
      'لا تطلبي كلمة مرور أو رمز تحقق أو بيانات بطاقة.',
      'اعتبري رقم الهاتف وسيلة تواصل وليس إثبات هوية.',
      'ساعدي العميل في المنيو والحجز والسلة والطلبات والفعاليات والاقتراحات.',
      'عند الحديث عن بيانات العميل، استخدمي الحد الأدنى اللازم فقط.',
      'بيانات المطعم الحالية من النظام:',
      JSON.stringify({ customer: customerContext, menu: menu })
    ].join('\\n');

    const turns = [...normalizeHistory(history), { role: 'user', content: text }];
    const input = turns.map(item => `${item.role === 'assistant' ? 'المساعد' : 'العميل'}: ${item.content}`).join('\\n');

    let reply;
    try {
      reply = await requestModel({ endpoint, apiKey, model, instructions, input });
    } catch (error) {
      if (error instanceof ShamsServiceError && error.status === 503) {
        const fallback = localConcierge({ message: text, customer, repository });
        return {
          ...fallback,
          reply: fallback.reply + '\\n\\nملاحظة: وضع شمس الذكي غير متاح الآن، فشغّلت لك المساعدة المحلية.'
        };
      }
      throw error;
    }

    const matches = findProductMatches(repository.products.all().filter(item => item?.available !== false), text);
    return {
      reply,
      actions: matches.length
        ? [{ type: 'navigate', url: '/menu/' + encodeURIComponent(matches[0].categorySlug || ''), label: 'عرض الخيارات' }]
        : []
    };
  }

  return { chat, status };
}
