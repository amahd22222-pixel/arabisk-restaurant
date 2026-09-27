import { createShamsAgent } from './shams-agent.js';
import { createShamsWorkflowService } from './shams-workflow-service.js';
import { createShamsMemoryService } from './shams-memory-service.js';

const MAX_MESSAGE = 1200;
const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'coral';
const DEFAULT_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_TTS_INSTRUCTIONS = 'صوت عربي طبيعي وهادئ، ودود، واضح، بإيقاع مطعم راقٍ، مع نطق عربي خليجي مفهوم.';

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
  ttsModel = DEFAULT_TTS_MODEL,
  ttsVoice = DEFAULT_TTS_VOICE,
  ttsEndpoint = DEFAULT_TTS_ENDPOINT,
  ttsInstructions = DEFAULT_TTS_INSTRUCTIONS,
  getOrderService,
  getReservationService
}) {
  const apiKey = clean(aiApiKey, 300);
  const model = clean(aiModel || DEFAULT_MODEL, 80) || DEFAULT_MODEL;
  const endpoint = clean(aiEndpoint || DEFAULT_ENDPOINT, 300) || DEFAULT_ENDPOINT;
  const speechModel = clean(ttsModel || DEFAULT_TTS_MODEL, 80) || DEFAULT_TTS_MODEL;
  const speechVoice = clean(ttsVoice || DEFAULT_TTS_VOICE, 80) || DEFAULT_TTS_VOICE;
  const speechEndpoint = clean(ttsEndpoint || DEFAULT_TTS_ENDPOINT, 300) || DEFAULT_TTS_ENDPOINT;
  const speechInstructions = clean(ttsInstructions || DEFAULT_TTS_INSTRUCTIONS, 500) || DEFAULT_TTS_INSTRUCTIONS;

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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        instructions: prompt,
        input: 'حلّل طلب العميل وأخرج خطة JSON وفق التعليمات. لا تكتب أي نص خارج JSON.',
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(15000)
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

  async function synthesizeSpeech(message) {
    const text = clean(message, 900);
    if (!text) throw new ShamsServiceError('نص الصوت فارغ.');
    if (!apiKey) throw new ShamsServiceError('الصوت الطبيعي غير مفعّل حاليًا.', 503);

    const response = await fetch(speechEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: speechModel,
        input: text,
        voice: speechVoice,
        instructions: speechInstructions,
        response_format: 'mp3'
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const providerMessage = clean(payload?.error?.message || 'TTS provider request failed.', 220);
      const error = new ShamsServiceError('تعذر توليد الصوت الطبيعي حاليًا.', 503);
      error.providerMessage = providerMessage;
      throw error;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength) throw new ShamsServiceError('وصل رد صوتي فارغ.', 503);

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: response.headers.get('content-type') || 'audio/mpeg'
    };
  }

  const status = () => ({
    configured: Boolean(apiKey),
    provider: apiKey ? 'openai-compatible' : 'local-agent',
    model: apiKey ? model : 'local',
    agent: true,
    workflows: ['reservation', 'order'],
    confirmations: true,
    memory: true,
    voiceFirst: true,
    ttsConfigured: Boolean(apiKey),
    tts: apiKey ? {
      provider: 'openai-compatible',
      model: speechModel,
      voice: speechVoice
    } : {
      provider: 'browser',
      model: 'local',
      voice: 'device'
    },
    stages: agent.stages
  });

  async function chat({
    message,
    history = [],
    profileToken = '',
    sessionId = '',
    page = '/',
    cart = []
  } = {}) {
    const text = clean(message);
    if (!text) throw new ShamsServiceError('رسالة شمس فارغة.');
    if (text.length > MAX_MESSAGE) throw new ShamsServiceError('رسالة شمس طويلة جدًا.');

    let customer = null;
    if (profileToken) {
      try {
        customer = findCustomerByProfileToken?.(profileToken) || null;
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
        customer
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

  return { chat, status, synthesizeSpeech };
}
