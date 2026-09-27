const MAX_TOOL_CALLS = 4;
const ALLOWED_PATHS = new Set(['/menu', '/reservation', '/cart', '/track-order', '/events', '/memories']);
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

function normalizeIntent(value) {
  const allowed = new Set([
    'greeting', 'menu', 'recommend', 'cart', 'reservation',
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

  if (/(ضيف|أضف|اضف|حط|حطي|ضيفي)\b/i.test(normalized)) {
    const product = matches[0] || latest;
    if (product) {
      return {
        intent: 'cart_add',
        toolCalls: [{ name: 'cart_add', args: { productId: product.id, quantity: 1 } }],
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

function buildLocalReply(intent, data) {
  if (intent === 'recommend') {
    const products = data.recommendations || [];
    if (!products.length) return 'ساعدني بتحديد ميزانيتك أو ذوقك، مثل: أريد شيئًا خفيفًا أو حارًا أو نباتيًا.';
    const lines = products.map(item => (item.nameAr || item.nameEn) + ' بسعر ' + item.price + ' درهم').join('، ');
    return 'رشحت لك ' + lines + '. وإذا أعجبك أول اختيار أضيفه لك للسلة.';
  }

  if (intent === 'product_search') {
    const products = data.matches || [];
    if (!products.length) return 'لم أجد طبقًا مطابقًا تمامًا. قل لي اسمًا آخر أو نوع الأكل الذي تريده.';
    return 'وجدت لك ' + products.slice(0, 3).map(item => item.nameAr || item.nameEn).join('، ') + '.';
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

export function createShamsAgent({ repository, memoryService, requestModel = null }) {
  const products = () => repository.products.all().filter(item => item?.available !== false);

  function buildIdentity({ customer, sessionId }) {
    return customer?.id
      ? { customerId: String(customer.id) }
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
      'الأدوات المسموحة: search_menu, recommend_menu, cart_add, navigate, get_order_status.',
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
      return {
        intent: normalizeIntent(plan.intent),
        reply: clean(plan.reply, 800),
        toolCalls: plan.toolCalls.slice(0, MAX_TOOL_CALLS).map(call => ({
          name: clean(call?.name, 50),
          args: call?.args && typeof call.args === 'object' ? call.args : {}
        })),
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
      added: toolResults.find(item => item.name === 'cart_add')?.result?.added,
      order: toolResults.find(item => item.name === 'get_order_status')?.result?.order
    };

    let reply = failedTool?.result?.error || clean(plan.reply, 800) || buildLocalReply(intent, responseData);
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
        slots: plan.memory && typeof plan.memory === 'object' ? plan.memory : {}
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
