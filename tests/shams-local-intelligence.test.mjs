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
  { id: 'p1', nameAr: 'شوربة عدس', nameEn: 'Lentil Soup', descriptionAr: 'شوربة عدس دافئة', price: 32, tags: ['light'], available: true },
  { id: 'p2', nameAr: 'ستيك لحم', nameEn: 'Beef Steak', descriptionAr: 'ستيك مشوي', price: 95, tags: [], available: true },
  { id: 'p3', nameAr: 'تشيز كيك', nameEn: 'Cheesecake', descriptionAr: 'حلو', price: 38, tags: ['dessert'], available: true }
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
