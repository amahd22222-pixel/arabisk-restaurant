const splitOrigins = (value) => new Set(
  String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

const productionDefaults = new Set(['https://arabiskadmin-production.up.railway.app']);
const developmentDefaults = new Set([
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

export const runtimeEnvironment = String(
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || ''
).trim().toLowerCase();

export const isProductionRuntime =
  process.env.NODE_ENV === 'production' || runtimeEnvironment === 'production';

const configuredOrigins = splitOrigins(process.env.ARABISK_CORS_ORIGINS);
export const allowedCorsOrigins = configuredOrigins.size
  ? configuredOrigins
  : isProductionRuntime
    ? productionDefaults
    : new Set([...productionDefaults, ...developmentDefaults]);

export const port = Number(process.env.PORT || 3000);
export const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
export const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
export const vapidSubject = String(process.env.VAPID_SUBJECT || '').trim();
export const stateKey = 'data/arabisk-state-v2.json';
export const menuVersion = 2;
export const maxVideoBytes = 120 * 1024 * 1024;
export const smartPopularWindowMs = 30 * 24 * 60 * 60 * 1000;
export const smartNewWindowMs = 14 * 24 * 60 * 60 * 1000;
export const shamsAiApiKey = String(process.env.SHAMS_AI_API_KEY || '').trim();
export const shamsAiModel = String(process.env.SHAMS_AI_MODEL || 'gpt-5.6-luna').trim();
export const shamsAiEndpoint = String(process.env.SHAMS_AI_ENDPOINT || 'https://api.openai.com/v1/responses').trim();
export const shamsTtsModel = String(process.env.SHAMS_TTS_MODEL || 'gpt-4o-mini-tts').trim();
export const shamsTtsVoice = String(process.env.SHAMS_TTS_VOICE || 'coral').trim();
export const shamsTtsEndpoint = String(process.env.SHAMS_TTS_ENDPOINT || 'https://api.openai.com/v1/audio/speech').trim();
export const shamsTtsInstructions = String(
  process.env.SHAMS_TTS_INSTRUCTIONS || 'صوت عربي طبيعي وهادئ، ودود، واضح، بإيقاع مطعم راقٍ، مع نطق عربي خليجي مفهوم.'
).trim();

export const videoTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);
