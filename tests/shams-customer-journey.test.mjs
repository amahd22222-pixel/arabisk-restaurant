import test from 'node:test';
import assert from 'node:assert/strict';

import { createCustomerRelationshipService } from '../apps/web/services/customer-relationship-service.js';
import { createShamsAgent } from '../apps/web/services/shams-agent.js';
import { buildSmartLocalPlan } from '../apps/web/services/shams-local-intelligence.js';

test('Shams local planner understands habitual-choice language as a recommendation', () => {
  const plan = buildSmartLocalPlan({
    message: 'هاتلي اللي باخده دايمًا',
    memory: { recentProducts: [] },
    products: [
      { id: 'P1', nameAr: 'طبق مميز', nameEn: 'Signature Dish', price: 60, available: true }
    ]
  });

  assert.equal(plan?.intent, 'recommend');
  assert.equal(plan?.toolCalls?.[0]?.name, 'recommend_menu');
});

test('Shams distinguishes an existing reservation lookup from a new booking request', () => {
  const plan = buildSmartLocalPlan({
    message: 'عايز اعرف حجزي الجاي',
    memory: { recentProducts: [] },
    products: []
  });

  assert.equal(plan?.intent, 'reservation_status');
  assert.equal(plan?.confidence >= 0.9, true);
});

test('Shams customer context exposes journey signals without phone or spend telemetry', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = value => String(value).padStart(2, '0');
  const date = tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate());

  const customer = {
    id: 'C1',
    name: 'أحمد',
    phone: '+971500000000',
    appMember: true,
    phoneVerified: true,
    createdAt: new Date().toISOString()
  };

  const service = createCustomerRelationshipService({
    repository: {
      customers: {
        all: () => [customer],
        findById: id => String(id) === 'C1' ? customer : null
      },
      orders: [],
      reservations: [{
        id: 'R1',
        customerId: 'C1',
        date,
        time: '20:00',
        guests: 2,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      }],
      products: [],
      notificationDevices: []
    }
  });

  const context = service.shamsContext('C1');
  assert.equal(context?.journey?.stage, 'upcoming_reservation');
  assert.equal(context?.journey?.nextBestAction, 'reservation_support');
  assert.equal('phone' in context, false);
  assert.equal('totalOrderValue' in context, false);
  assert.equal('averageOrderValue' in context, false);
});

test('Shams keeps returning-customer recommendations familiar but not repetitive', async () => {
  const agent = createShamsAgent({
    repository: {
      categories: { all: () => [] },
      products: {
        all: () => [
          { id: 'P1', nameAr: 'المفضل', nameEn: 'Favorite', price: 60, available: true, chefChoice: false, isNew: false, rating: 4 },
          { id: 'P2', nameAr: 'من نفس القسم', nameEn: 'Same Category', price: 60, available: true, categoryNameAr: 'أطباق رئيسية', chefChoice: false, isNew: false, rating: 4 },
          { id: 'P3', nameAr: 'اكتشاف جديد', nameEn: 'New Discovery', price: 65, available: true, chefChoice: true, isNew: true, rating: 5 },
          { id: 'P4', nameAr: 'اختيار إضافي', nameEn: 'Extra', price: 50, available: true, chefChoice: false, isNew: false, rating: 3 }
        ]
      }
    },
    memoryService: {
      async read() {
        return {
          preferences: { budgetAed: null, spicy: null, vegetarian: null, taste: null, weight: null, category: '', protein: null },
          recentProducts: [], recentTurns: [], journey: {}, lastIntent: '', name: ''
        };
      },
      async rememberTurn() { return true; }
    },
    workflowService: { confirmation: () => null },
    requestModel: null
  });

  const result = await agent.handle({
    message: 'رشحلي',
    sessionId: 's',
    customer: { id: 'C2', name: 'أحمد' },
    customerContext: {
      journey: { stage: 'returning_favorite', nextBestAction: 'favorite_recommendation' },
      favoriteProducts: [{ name: 'المفضل', quantity: 5 }],
      favoriteCategories: [{ name: 'أطباق رئيسية', quantity: 4 }]
    }
  });

  assert.equal(result.intent, 'recommend');
  assert.match(result.reply, /المفضل/);
  assert.match(result.reply, /اكتشاف جديد|من نفس القسم/);
});

test('Shams remembers the exact workflow step that needs the next input', async () => {
  let saved = null;
  const memoryService = {
    async read() {
      return {
        version: 1,
        scope: 'session',
        customerId: '',
        sessionId: 'session-workflow',
        name: 'أحمد',
        preferences: {
          budgetAed: null,
          spicy: null,
          vegetarian: null,
          taste: null,
          weight: null,
          category: '',
          protein: null,
          favoriteCategories: [],
          favoriteProducts: []
        },
        recentTurns: [],
        recentProducts: [],
        lastIntent: '',
        pendingAction: null,
        journey: { stage: '', nextBestAction: '', intent: '', step: '', slots: {} },
        updatedAt: '',
        expiresAt: Date.now() + 86400000
      };
    },
    async rememberTurn(identity, patch) {
      saved = { identity, patch };
      return true;
    },
    async save() { return true; }
  };

  const workflowService = {
    confirmation: () => null,
    async handleReservation() {
      return {
        status: 'needs_input',
        missingField: 'الوقت',
        reply: 'حاضر. أحتاج الوقت أولاً.',
        pending: { date: '2026-09-30', guests: 2 }
      };
    }
  };

  const agent = createShamsAgent({
    repository: {
      categories: { all: () => [] },
      products: { all: () => [] }
    },
    memoryService,
    workflowService,
    requestModel: async () => JSON.stringify({
      intent: 'reservation',
      reply: '',
      toolCalls: [],
      memory: { budgetAed: null, spicy: null, vegetarian: null },
      workflow: {
        date: '',
        time: '',
        guests: null,
        name: '',
        phone: '',
        eventSlug: '',
        orderType: '',
        tableNumber: ''
      }
    })
  });

  const result = await agent.handle({
    message: 'عايز احجز',
    sessionId: 'session-workflow',
    customer: null,
    customerContext: null,
    history: [],
    page: '/',
    cart: []
  });

  assert.equal(result.intent, 'reservation');
  assert.equal(saved?.patch?.journey?.step, 'awaiting_الوقت');
});

test('Shams local agent prioritizes a known favorite when customer asks for their usual choice', async () => {
  let saved = null;
  const memoryService = {
    async read() {
      return {
        version: 1,
        scope: 'customer',
        customerId: 'C1',
        sessionId: '',
        name: 'أحمد',
        preferences: {
          budgetAed: null,
          spicy: null,
          vegetarian: null,
          taste: null,
          weight: null,
          category: '',
          protein: null,
          favoriteCategories: [],
          favoriteProducts: []
        },
        recentTurns: [],
        recentProducts: [],
        lastIntent: '',
        pendingAction: null,
        journey: { intent: '', step: '', slots: {} },
        updatedAt: '',
        expiresAt: Date.now() + 86400000
      };
    },
    async rememberTurn(identity, patch) {
      saved = { identity, patch };
      return true;
    }
  };

  const workflowService = {
    confirmation: () => null
  };

  const agent = createShamsAgent({
    repository: {
      categories: { all: () => [] },
      products: {
        all: () => [
          { id: 'P1', nameAr: 'طبق مفضل', nameEn: 'Favorite Dish', price: 70, available: true, chefChoice: false, isNew: false, rating: 3 },
          { id: 'P2', nameAr: 'طبق آخر', nameEn: 'Another Dish', price: 70, available: true, chefChoice: true, isNew: false, rating: 5 }
        ]
      }
    },
    memoryService,
    workflowService,
    requestModel: null
  });

  const result = await agent.handle({
    message: 'هاتلي اللي باخده دايمًا',
    sessionId: 'session-1',
    customer: { id: 'C1', name: 'أحمد' },
    customerContext: {
      customerId: 'C1',
      name: 'أحمد',
      appMember: true,
      phoneVerified: true,
      lifecycle: { key: 'active', label: 'نشط' },
      orderCount: 4,
      reservationCount: 0,
      favoriteProducts: [{ name: 'طبق مفضل', quantity: 5 }],
      favoriteCategories: [],
      nextReservation: null,
      journey: {
        stage: 'returning_favorite',
        nextBestAction: 'favorite_recommendation',
        reason: 'history'
      }
    }
  });

  assert.equal(result.intent, 'recommend');
  assert.match(result.reply, /طبق مفضل/);
  assert.equal(saved?.patch?.journey?.intent, 'recommend');
  assert.equal(saved?.identity?.customerId, 'C1');
});
