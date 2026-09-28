import test from 'node:test';
import assert from 'node:assert/strict';
import { createShamsAgent } from '../apps/web/services/shams-agent.js';

function createMemoryService() {
  let value = {
    name: '',
    preferences: {},
    recentProducts: [],
    recentTurns: [],
    pendingAction: null,
    journey: {}
  };
  return {
    async read() { return structuredClone(value); },
    async save(_identity, patch = {}) {
      value = { ...value, ...patch };
      return structuredClone(value);
    },
    async rememberTurn(_identity, data = {}) {
      value = {
        ...value,
        name: data.name || value.name,
        lastIntent: data.intent || value.lastIntent,
        recentProducts: Array.isArray(data.products) ? data.products.slice(-8) : value.recentProducts
      };
      return structuredClone(value);
    }
  };
}

function createAgent(requestModel) {
  const repository = {
    categories: {
      all: () => [
        { id: 'soups', nameAr: 'الشوربات', nameEn: 'Soups', active: true },
        { id: 'mains', nameAr: 'الأطباق الرئيسية', nameEn: 'Main Course', active: true }
      ]
    },
    products: {
      all: () => [
        {
          id: 'p1',
          nameAr: 'شوربة عدس',
          nameEn: 'Lentil Soup',
          descriptionAr: 'شوربة عدس دافئة',
          descriptionEn: 'Warm lentil soup',
          price: 32,
          available: true,
          categoryId: 'soups',
          categorySlug: 'soups',
          tags: ['light']
        },
        {
          id: 'p2',
          nameAr: 'ستيك لحم',
          nameEn: 'Beef Steak',
          descriptionAr: 'ستيك لحم مشوي',
          descriptionEn: 'Grilled beef steak',
          price: 95,
          available: true,
          categoryId: 'mains',
          categorySlug: 'mains',
          tags: []
        }
      ]
    },
    orders: { findById: () => null }
  };
  return createShamsAgent({
    repository,
    memoryService: createMemoryService(),
    workflowService: null,
    requestModel
  });
}

test('structured model plan can answer product details through a real tool result', async () => {
  const agent = createAgent(async () => JSON.stringify({
    intent: 'product_info',
    reply: '',
    toolCalls: [{ name: 'product_info', argsJson: JSON.stringify({ productId: 'p2' }) }],
    memory: { budgetAed: null, spicy: null, vegetarian: null },
    workflow: { date: '', time: '', guests: null, name: '', phone: '', eventSlug: '', orderType: '', tableNumber: '' }
  }));

  const result = await agent.handle({
    message: 'احكيلي عن الستيك',
    sessionId: 'test-product-info',
    history: [],
    cart: [],
    page: '/menu'
  });

  assert.equal(result.intent, 'product_info');
  assert.match(result.reply, /ستيك لحم/);
  assert.match(result.reply, /95/);
});

test('structured model plan can request a safe cart action using argsJson', async () => {
  const agent = createAgent(async () => JSON.stringify({
    intent: 'cart_add',
    reply: '',
    toolCalls: [{ name: 'cart_add', argsJson: JSON.stringify({ productId: 'p1', quantity: 2 }) }],
    memory: { budgetAed: null, spicy: null, vegetarian: null },
    workflow: { date: '', time: '', guests: null, name: '', phone: '', eventSlug: '', orderType: '', tableNumber: '' }
  }));

  const result = await agent.handle({
    message: 'ضيفلي شوربة العدس مرتين',
    sessionId: 'test-cart-add',
    history: [],
    cart: [],
    page: '/menu'
  });

  assert.equal(result.intent, 'cart_add');
  assert.equal(result.actions[0]?.type, 'cart.add');
  assert.equal(result.actions[0]?.product?.id, 'p1');
  assert.equal(result.actions[0]?.quantity, 2);
});


test('structured model navigation resolves a category through the live catalog', async () => {
  const agent = createAgent(async () => JSON.stringify({
    intent: 'navigate',
    reply: '',
    toolCalls: [{ name: 'navigate', argsJson: JSON.stringify({ categoryId: 'soups' }) }],
    memory: { budgetAed: null, spicy: null, vegetarian: null },
    workflow: { date: '', time: '', guests: null, name: '', phone: '', eventSlug: '', orderType: '', tableNumber: '' }
  }));

  const result = await agent.handle({
    message: 'افتح الشوربات',
    sessionId: 'test-category-navigation',
    history: [],
    cart: [],
    page: '/'
  });

  assert.equal(result.intent, 'navigate');
  assert.equal(result.actions[0]?.type, 'navigate');
  assert.equal(result.actions[0]?.url, '/menu/soups');
});

test('structured model navigation rejects a category/product combination that does not match', async () => {
  const agent = createAgent(async () => JSON.stringify({
    intent: 'navigate',
    reply: '',
    toolCalls: [{ name: 'navigate', argsJson: JSON.stringify({ categoryId: 'mains', productId: 'p1' }) }],
    memory: { budgetAed: null, spicy: null, vegetarian: null },
    workflow: { date: '', time: '', guests: null, name: '', phone: '', eventSlug: '', orderType: '', tableNumber: '' }
  }));

  const result = await agent.handle({
    message: 'افتح الصنف',
    sessionId: 'test-invalid-navigation',
    history: [],
    cart: [],
    page: '/'
  });

  assert.deepEqual(result.actions, []);
  assert.match(result.reply, /لم أجد|الصفحة/);
});