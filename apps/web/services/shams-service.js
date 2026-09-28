import { createShamsAgent } from './shams-agent.js';
import { createShamsWorkflowService } from './shams-workflow-service.js';
import { createShamsMemoryService } from './shams-memory-service.js';

const MAX_MESSAGE = 1200;
const DEFAULT_MODEL = 'gpt-6-sol';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';

class ShamsServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ShamsServiceError';
    this.status = status;
  }
}

const clean = (value, max = MAX_MESSAGE) => String(value ?? '').trim().slice(0, max);

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) texts.push(part.text.trim());
    }
  }
  return texts.join('\n').trim();
}

export function createShamsService({
  repository,
  findCustomerByProfileToken,
  readJsonWithStatus,
  writeJson,
  aiApiKey = '',
  aiModel = DEFAULT_MODEL,
  aiEndpoint = DEFAULT_ENDPOINT,
  getOrderService,
  getReservationService,
  getCustomerRelationship
}) {
  const apiKey = clean(aiApiKey, 300);
  const model = clean(aiModel || DEFAULT_MODEL, 80) || DEFAULT_MODEL;
  const endpoint = clean(aiEndpoint || DEFAULT_ENDPOINT, 300) || DEFAULT_ENDPOINT;

  const memoryService = createShamsMemoryService({
    readJsonWithStatus,
    writeJson
  });

  const workflowService = createShamsWorkflowService({
    memoryService,
    getOrderService,
    getReservationService
  });

  async function requestModel(prompt) {
    if (!apiKey) return '';

    const planSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: {
          type: 'string',
          enum: [
            'greeting', 'menu', 'navigate', 'category_selection', 'recommend', 'cart', 'cart_summary', 'reservation',
            'reservation_status', 'order', 'order_status', 'events', 'memories', 'product_search',
            'product_info', 'cart_add', 'unknown'
          ]
        },
        reply: { type: 'string' },
        toolCalls: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                type: 'string',
                enum: [
                  'search_menu', 'recommend_menu', 'product_info',
                  'cart_summary', 'cart_add', 'navigate', 'get_order_status'
                ]
              },
              argsJson: { type: 'string' }
            },
            required: ['name', 'argsJson']
          }
        },
        memory: {
          type: 'object',
          additionalProperties: false,
          properties: {
            budgetAed: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            spicy: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
            vegetarian: { anyOf: [{ type: 'boolean' }, { type: 'null' }] }
          },
          required: ['budgetAed', 'spicy', 'vegetarian']
        },
        workflow: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string' },
            time: { type: 'string' },
            guests: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            name: { type: 'string' },
            phone: { type: 'string' },
            eventSlug: { type: 'string' },
            orderType: { type: 'string' },
            tableNumber: { type: 'string' }
          },
          required: ['date', 'time', 'guests', 'name', 'phone', 'eventSlug', 'orderType', 'tableNumber']
        }
      },
      required: ['intent', 'reply', 'toolCalls', 'memory', 'workflow']
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions: prompt,
        input: 'حلّل طلب العميل بمنتهى الدقة. التزم بالمخطط المحدد وأخرج JSON صالح فقط. لا تعتمد على أي مصدر خارج سياق المطعم المرسل لك.',
        reasoning: { effort: model === 'gpt-6-sol' ? 'high' : 'medium' },
        max_output_tokens: 1800,
        text: {
          format: {
            type: 'json_schema',
            name: 'shams_agent_plan',
            strict: true,
            schema: planSchema
          }
        }
      }),
      signal: AbortSignal.timeout(20000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = clean(payload?.error?.message || 'AI provider request failed.', 220);
      const error = new ShamsServiceError('تعذر تشغيل محرك شمس الذكي حاليًا.', 503);
      error.providerMessage = providerMessage;
      throw error;
    }

    const reply = extractResponseText(payload);
    if (!reply) throw new ShamsServiceError('لم تصل خطة صالحة من محرك شمس.', 503);
    return reply;
  }

  const agent = createShamsAgent({
    repository,
    memoryService,
    workflowService,
    requestModel: apiKey ? requestModel : null
  });

  const status = () => ({
    configured: Boolean(apiKey),
    provider: apiKey ? 'openai-compatible' : 'local-agent',
    model: apiKey ? model : 'local',
    brain: apiKey ? 'llm' : 'local-fallback',
    reasoning: apiKey ? (model === 'gpt-6-sol' ? 'high' : 'medium') : 'rule-based',
    agent: true,
    workflows: ['reservation', 'order'],
    confirmations: true,
    memory: true,
    voiceFirst: true,
    dialects: ['ar-AE', 'ar-EG', 'ar-SY', 'ar-LB'],
    listening: { continuous: true, pauseMs: 2200 },
    installedApp: { surface: 'installed-pwa', updateManaged: true },
    stages: agent.stages
  });

  async function chat({
    message,
    history = [],
    profileToken = '',
    sessionId = '',
    page = '/',
    cart = [],
    client = null
  } = {}) {
    const text = clean(message);
    if (!text) throw new ShamsServiceError('رسالة شمس فارغة.');
    if (text.length > MAX_MESSAGE) throw new ShamsServiceError('رسالة شمس طويلة جدًا.');

    let customer = null;
    let customerContext = null;
    if (profileToken) {
      try {
        customer = findCustomerByProfileToken?.(profileToken) || null;
        if (customer?.id && typeof getCustomerRelationship === 'function') {
          try { customerContext = getCustomerRelationship(customer.id); } catch { customerContext = null; }
        }
      } catch {
        customer = null;
      }
    }

    try {
      return await agent.handle({
        message: text,
        history,
        profileToken,
        sessionId: clean(sessionId, 120),
        page: clean(page, 120),
        cart,
        client: client && typeof client === 'object' ? {
          surface: clean(client.surface, 30),
          serviceWorkerControlled: Boolean(client.serviceWorkerControlled)
        } : null,
        customer,
        customerContext
      });
    } catch (error) {
      if (error instanceof ShamsServiceError) throw error;
      const fallback = {
        stage: 'respond',
        stages: agent.stages,
        intent: 'unknown',
        reply: customer?.name
          ? 'أنا معك يا ' + customer.name + '. حصل عطل مؤقت في مسار شمس، جرّب مرة أخرى.'
          : 'أنا معك. حصل عطل مؤقت في مسار شمس، جرّب مرة أخرى.',
        actions: [],
        memory: { scope: customer ? 'customer' : 'session', remembered: false, preferences: {} }
      };
      console.error(JSON.stringify({
        event: 'shams_agent_failure',
        error: clean(error?.message || error, 240)
      }));
      return fallback;
    }
  }

  return { chat, status };
}
