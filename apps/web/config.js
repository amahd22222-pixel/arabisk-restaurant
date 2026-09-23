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
export const stateKey = 'data/arabisk-state.json';
export const menuVersion = 2;
export const maxVideoBytes = 120 * 1024 * 1024;

export const videoTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);
