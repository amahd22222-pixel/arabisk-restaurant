const MAX_TOOL_CALLS = 4;
const ALLOWED_PATHS = new Set(['/menu', '/reservation', '/cart', '/track-order', '/events', '/memories']);
const ALLOWED_TOOLS = new Set([
  'search_menu',
  'recommend_menu',
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
      if (call.name === 'navigate') return ALLOWED_PATHS.has(clean(call.args.path, 120));
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
    'greeting', 'menu', 'recommend', 'cart', 'cart_summary', 'reservation',
    'order_status', 'events', 'memories', 'product_search',
    'cart_add', 'unknown'
  ]);
  return allowed.has(value) ? value : 'unknown';
}

function findMatches(products, query) {
  const q = String(query || '').toLocaleLowerCase('ar').trim();
  if (!q) return [];
  return products.filter(product => {
    const haystack = [
      product.nameAr, product.nameEn, product.descriptionAr, product.descriptionEn,
      product.categorySlug, product.categoryId, ...(Array.isArray(product.tags) ? product.tags : [])
    ].join(' ').toLocaleLowerCase('ar');
    return haystack && q.split(/\s+/).some(token => token.length >= 3 && haystack.includes(token));
  }).slice(0, 6);
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

function detectLocalPlan({ message, memory, products }) {
  const text = clean(message);
  const normalized = text.toLocaleLowerCase('ar');
  const matches = findMatches(products, text);
  const latest = memory.recentProducts?.[memory.recentProducts.length - 1] || null;

  if (/^(السلام|هلا|اهلا|أهلا|مرحبا|هاي|hello|hi)\b/i.test(normalized)) {
    return {
      intent: 'greeting',
      reply: memory.name
        ? 'أهلاً يا ' + memory.name + '. أنا شمس، معك داخل ARABISK.'
        : 'أهلاً بك. أنا شمس، معك داخل ARABISK.'
    };
  }

  if (/(ضيف|أضف|اضف|حط|حطي|ضيفي)/i.test(normalized)) {
    const product = matches[0] || latest;
    if (product) {
      return {
        intent: 'cart_add',
        toolCalls: [{ name: 'cart_add', args: { productId: product.id, quantity: parseQuantity(text) } }],
        reply: 'حاضر. أضيف لك ' + (product.nameAr || product.nameEn) + ' إلى طلبك.'
      };
    }
    return { intent: 'cart_add', reply: 'أكيد. قل لي اسم الطبق الذي تريد إضافته، وسأضيفه لك.' };
  }

  if (/(اختار|اختيار|محتار|محتارة|رشح|اقترح|اقتراح|recommend|choose)/i.test(normalized)) {
    return { intent: 'recommend', toolCalls: [{ name: 'recommend_menu', args: {} }] };
  }

  if (/(منيو|القائمة|الأكل|الأطباق|افتح.*منيو|وريني.*منيو|شوف.*منيو)/i.test(normalized)) {
    return { intent: 'menu', toolCalls: [{ name: 'navigate', args: { path: '/menu' } }], reply: 'أكيد، أفتح لك المنيو الآن.' };
  }

  if (/(احجز|حجز|طاولة|موعد)/i.test(normalized)) {
    return { intent: 'reservation', toolCalls: [{ name: 'navigate', args: { path: '/reservation' } }], reply: 'أكيد، نبدأ الحجز من هنا.' };
  }

  if (/(السلة|العربة|cart)/i.test(normalized)) {
    if (/(فيها|موجود|محتوى|محتويات|المجموع|الإجمالي|بكام|كام|إيه|ايه|اعرض|وريني|شوف)/i.test(normalized)) {
      return { intent: 'cart_summary', toolCalls: [{ name: 'cart_summary', args: {} }] };
    }
    return { intent: 'cart', toolCalls: [{ name: 'navigate', args: { path: '/cart' } }], reply: 'حاضر، أفتح لك السلة.' };
  }

  if (/(متابعة|تتبع|الطلب|الطلبات|order)/i.test(normalized)) {
    const orderMatch = normalized.match(/\bo\d{5}\b/i);
    if (orderMatch) {
      return { intent: 'order_status', toolCalls: [{ name: 'get_order_status', args: { orderId: orderMatch[0].toUpperCase() } }] };
    }
    return { intent: 'order_status', toolCalls: [{ name: 'navigate', args: { path: '/track-order' } }], reply: 'أفتح لك متابعة الطلب، وهناك نكمل التتبع.' };
  }

  if (/(فعالي|تجارب|حدث|events)/i.test(normalized)) {
    return { intent: 'events', toolCalls: [{ name: 'navigate', args: { path: '/events' } }], reply: 'أفتح لك التجارب والفعاليات القادمة.' };
  }

  if (/(ذكريات|صور|فيديو|فديو|memories)/i.test(normalized)) {
    return { intent: 'memories', toolCalls: [{ name: 'navigate', args: { path: '/memories' } }], reply: 'أفتح لك ذكريات ARABISK.' };
  }

  if (matches.length) {
    return {
      intent: 'product_search',
      toolCalls: [{ name: 'search_menu', args: { query: text } }]
    };
  }

  return {
    intent: 'unknown',
    reply: memory.name
      ? 'أنا معك يا ' + memory.name + '. أقدر أساعدك في اختيار الأكل، المنيو، السلة، الحجز، متابعة الطلب والفعاليات.'
      : 'أنا معك. أقدر أساعدك في اختيار الأكل، المنيو، السلة، الحجز، متابعة الطلب والفعاليات.'
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
    return 'رشحت لك ' + lines + '. وإذا أعجبك أول اختيار أضيفه لك للسلة.';
  }

  if (intent === 'menu') return data.menuOpened ? 'أكيد، أفتح لك المنيو الآن.' : 'تعذر فتح المنيو الآن.';
  if (intent === 'cart') return data.cartOpened ? 'حاضر، أفتح لك السلة.' : 'تعذر فتح السلة الآن.';
  if (intent === 'events') return data.eventsOpened ? 'أفتح لك التجارب والفعاليات القادمة.' : 'تعذر فتح الفعاليات الآن.';
  if (intent === 'memories') return data.memoriesOpened ? 'أفتح لك ذكريات ARABISK.' : 'تعذر فتح الذكريات الآن.';
  if (intent === 'product_search') {
    const products = data.matches || [];
    if (!products.length) return 'لم أجد طبقًا مطابقًا تمامًا. قل لي اسمًا آخر أو نوع الأكل الذي تريده.';
    return 'وجدت لك ' + products.slice(0, 3).map(item => item.nameAr || item.nameEn).join('، ') + '.';
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
  const products = () => repository.products.all().filter(item => item?.available !== false);

  function buildIdentity({ customer, sessionId }) {
    return customer?.id
      ? { customerId: String(customer.id), sessionId: clean(sessionId, 120) }
      : { sessionId: clean(sessionId, 120) };
  }

  async function toolExecute(name, args, context) {
    const catalog = products();

    if (name === 'search_menu') {
      const query = clean(args?.query || context.message, 220);
      return { matches: findMatches(catalog, query) };
    }

    if (name === 'recommend_menu') {
      return { recommendations: pickRecommendations(catalog, context.memory.preferences, context.message) };
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
      const path = clean(args?.path, 120);
      return ALLOWED_PATHS.has(path)
        ? { clientAction: { type: 'navigate', url: path } }
        : { error: 'المسار غير مسموح.' };
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

    const catalog = products().slice(0, 36).map(item => ({
      id: String(item.id),
      nameAr: clean(item.nameAr, 100),
      price: Number(item.price || 0),
      categoryId: clean(item.categoryId, 80),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : []
    }));

    const prompt = [
      'أنتِ شمس Agent لمطعم ARABISK. لا تتخذي أي إجراء خارج الأدوات المحددة.',
      'أخرجي JSON فقط بالشكل: {"intent":"...","reply":"...","toolCalls":[{"name":"...","args":{}}],"memory":{"budgetAed":null,"spicy":null,"vegetarian":null}}',
      'الأدوات المسموحة: search_menu, recommend_menu, cart_summary, cart_add, navigate, get_order_status.',
      'المسارات المسموحة: /menu, /reservation, /cart, /track-order, /events, /memories.',
      'لا تدّعي نجاح إضافة أو تنفيذ أي شيء قبل وصول نتيجة الأداة.',
      'لا تطلبي كلمات مرور أو OTP أو بيانات بطاقات.',
      'العميل الحالي: ' + JSON.stringify(context.customer ? { id: context.customer.id, name: context.customer.name || '' } : null),
      'ذاكرة شمس: ' + JSON.stringify(context.memory),
      'الصفحة الحالية: ' + clean(context.page, 100),
      'السلة الحالية: ' + JSON.stringify(Array.isArray(context.cart) ? context.cart.slice(0, 20) : []),
      'كتالوج مختصر: ' + JSON.stringify(catalog),
      'رسالة العميل: ' + clean(context.message, 1200)
    ].join('\n');

    try {
      const result = await requestModel(prompt);
      const plan = jsonFromText(result);
      if (!plan || !Array.isArray(plan.toolCalls)) return null;
      const intent = normalizeIntent(plan.intent);
      const toolCalls = sanitizeToolCalls(plan.toolCalls);
      const toolDependent = new Set(['menu', 'recommend', 'cart', 'cart_summary', 'cart_add', 'order_status']);
      if (toolDependent.has(intent) && !toolCalls.length) return null;
      return {
        intent,
        reply: clean(plan.reply, 800),
        toolCalls,
        memory: plan.memory && typeof plan.memory === 'object' ? plan.memory : {}
      };
    } catch {
      return null;
    }
  }

  async function handle(input = {}) {
    const message = clean(input.message, 1200);
    if (!message) throw new Error('رسالة شمس فارغة.');

    const customer = input.customer || null;
    const identity = buildIdentity({ customer, sessionId: input.sessionId });
    let stage = 'understand';

    const memory = await memoryService.read(identity);
    stage = 'recall';

    const context = {
      message,
      customer,
      sessionId: clean(input.sessionId, 120),
      page: clean(input.page, 120),
      cart: Array.isArray(input.cart) ? input.cart.slice(0, 20) : [],
      history: Array.isArray(input.history) ? input.history.slice(-10) : [],
      memory
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

    const reservationRequested = /(احجز|حجز|حجزي|طاولة|حاجز|موعد)/i.test(message);
    const orderRequested = /(اطلب|طلبلي|اطلبلي|عاوز طلب|عايز طلب|اعمل طلب|سوّي طلب|سوي طلب|checkout|checkout)/i.test(message);
    const pendingType = pendingActionIsUsable(memory.pendingAction) ? memory.pendingAction.type : '';

    if (workflowService && (reservationRequested || pendingType === 'reservation')) {
      const result = await workflowService.handleReservation({
        identity,
        message,
        memory,
        customer
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
        customer
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
    const localPlan = detectLocalPlan({ message, memory, products: products() });
    const model = await modelPlan(context);
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
      if (action.type === 'navigate') return ALLOWED_PATHS.has(action.url);
      if (action.type === 'cart.add') {
        return action.product?.id && Number(action.quantity) >= 1 && Number(action.quantity) <= 20;
      }
      return false;
    });

    const failedTool = toolResults.find(item => item.result?.error);
    const responseData = {
      recommendations: toolResults.find(item => item.name === 'recommend_menu')?.result?.recommendations || [],
      matches: toolResults.find(item => item.name === 'search_menu')?.result?.matches || [],
      cartSummary: toolResults.find(item => item.name === 'cart_summary')?.result?.cartSummary || toolResults.find(item => item.name === 'cart_summary')?.result || null,
      added: toolResults.find(item => item.name === 'cart_add')?.result?.added,
      order: toolResults.find(item => item.name === 'get_order_status')?.result?.order
    };

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

    if (!reply) reply = 'أنا معك. قل لي ماذا تريد أن نفعل داخل ARABISK.';

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
        } : {}
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
