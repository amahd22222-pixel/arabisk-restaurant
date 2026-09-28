import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __test,
  buildSmartLocalPlan,
  detectDialect,
  normalizeArabic,
  rankProducts
} from '../apps/web/services/shams-local-intelligence.js';

const products = [
  { id: 'p1', nameAr: 'شوربة عدس', nameEn: 'Lentil Soup', descriptionAr: 'شوربة عدس دافئة', price: 32, categoryId: 'soups', categoryNameAr: 'الشوربات', categoryNameEn: 'Soups', tags: ['light'], available: true },
  { id: 'p2', nameAr: 'ستيك لحم', nameEn: 'Beef Steak', descriptionAr: 'ستيك مشوي', price: 95, categoryId: 'mains', categoryNameAr: 'الأطباق الرئيسية', categoryNameEn: 'Main Course', tags: [], available: true },
  { id: 'p3', nameAr: 'تشيز كيك', nameEn: 'Cheesecake', descriptionAr: 'حلو', price: 38, categoryId: 'desserts', categoryNameAr: 'الحلويات', categoryNameEn: 'Desserts', tags: ['dessert'], available: true }
];

const categories = [
  { id: 'soups', nameAr: 'الشوربات', nameEn: 'Soups', active: true },
  { id: 'mains', nameAr: 'الأطباق الرئيسية', nameEn: 'Main Course', active: true },
  { id: 'desserts', nameAr: 'الحلويات', nameEn: 'Desserts', active: true }
];

test('normalizes Arabic letters and Arabic numerals', () => {
  assert.equal(normalizeArabic('أوّل ٢'), 'اول 2');
});

test('detects common dialects', () => {
  assert.equal(detectDialect('شو هيدا الطبق؟'), 'lebanese');
  assert.equal(detectDialect('عايز حاجة حلوة'), 'egyptian');
  assert.equal(detectDialect('بدي شي هلق'), 'syrian');
});

test('ranks a misspelled product instead of requiring exact text', () => {
  const matches = rankProducts(products, 'شربه عدس', 3);
  assert.equal(matches[0].id, 'p1');
});

test('builds recommendation plans from conversational preferences', () => {
  const plan = buildSmartLocalPlan({
    message: 'عايز حاجة حلوة اقل من 50',
    memory: {},
    products
  });
  assert.equal(plan.intent, 'recommend');
  assert.equal(plan.toolCalls[0].name, 'recommend_menu');
  assert.equal(plan.toolCalls[0].args.budgetAed, 50);
  assert.equal(plan.toolCalls[0].args.taste, 'sweet');
});

test('resolves conversational reference to the remembered second item', () => {
  const plan = buildSmartLocalPlan({
    message: 'ضيف التاني واتنين',
    memory: {
      recentProducts: [
        { id: 'p1', nameAr: 'شوربة عدس', price: 32 },
        { id: 'p2', nameAr: 'ستيك لحم', price: 95 }
      ]
    },
    products
  });
  assert.equal(plan.intent, 'cart_add');
  assert.equal(plan.toolCalls[0].args.productId, 'p2');
  assert.equal(plan.toolCalls[0].args.quantity, 2);
});

test('does not turn negated requests into executable workflow requests', () => {
  assert.equal(__test.isNegatedAction('مش عايز احجز', 'reservation'), true);
  assert.equal(__test.isNegatedAction('مو عايز طلب', 'order'), true);
});


test('adds a product from an Arabic category request', () => {
  const plan = buildSmartLocalPlan({
    message: 'ضيفلي أي حاجة من قسم الحلويات',
    memory: {},
    products,
    categories
  });
  assert.equal(plan.intent, 'cart_add');
  assert.equal(plan.toolCalls[0].name, 'cart_add');
  assert.equal(plan.toolCalls[0].args.productId, 'p3');
});

test('opens the requested category instead of turning it into a recommendation', () => {
  const plan = buildSmartLocalPlan({
    message: 'افتح قسم الحلويات',
    memory: {},
    products,
    categories
  });
  assert.equal(plan.intent, 'navigate');
  assert.equal(plan.toolCalls[0].name, 'navigate');
  assert.equal(plan.toolCalls[0].args.categoryId, 'desserts');
});

test('opens a specific product page when the spoken request names the dish', () => {
  const plan = buildSmartLocalPlan({
    message: 'افتح تشيز كيك',
    memory: {},
    products,
    categories
  });
  assert.equal(plan.intent, 'navigate');
  assert.equal(plan.toolCalls[0].name, 'navigate');
  assert.equal(plan.toolCalls[0].args.productId, 'p3');
  assert.equal(plan.toolCalls[0].args.categoryId, 'desserts');
});

test('opens common site pages directly from natural spoken commands', () => {
  for (const [message, expected] of [
    ['افتح الرئيسية', '/'],
    ['افتح الحجز', '/reservation'],
    ['افتح السلة', '/cart'],
    ['افتح متابعة الطلب', '/track-order'],
    ['افتح الفعاليات', '/events'],
    ['افتح الذكريات', '/memories'],
    ['افتح سياسة الخصوصية', '/privacy']
  ]) {
    const plan = buildSmartLocalPlan({ message, memory: {}, products, categories });
    assert.equal(plan.intent, 'navigate', message);
    assert.equal(plan.toolCalls[0].args.path, expected, message);
  }
});

test('uses the open category page to resolve positional additions', () => {
  const categoryProducts = [
    { id: 'p1', nameAr: 'شوربة عدس', nameEn: 'Lentil Soup', price: 32, categoryId: 'soups', available: true, sortOrder: 1 },
    { id: 'p2', nameAr: 'شوربة فطر', nameEn: 'Mushroom Soup', price: 22, categoryId: 'soups', available: true, sortOrder: 2 }
  ];
  const plan = buildSmartLocalPlan({
    message: 'ضيفلي الأول',
    memory: {},
    products: [...categoryProducts, ...products],
    categories: [{ id: 'soups', nameAr: 'الشوربات', nameEn: 'Soups', active: true }],
    page: '/menu/soups'
  });
  assert.equal(plan.intent, 'cart_add');
  assert.equal(plan.toolCalls[0].args.productId, 'p1');
});

test('uses the open product page to resolve "add this"', () => {
  const plan = buildSmartLocalPlan({
    message: 'ضيف ده',
    memory: {},
    products,
    categories: [{ id: 'desserts', nameAr: 'الحلويات', nameEn: 'Desserts', active: true }],
    page: '/menu/desserts/p3'
  });
  assert.equal(plan.intent, 'cart_add');
  assert.equal(plan.toolCalls[0].args.productId, 'p3');
});