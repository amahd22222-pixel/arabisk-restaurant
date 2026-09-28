import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { presign, storageReady, writeObject, deleteObject } from './storage.js';
import { dbReady, readJsonWithStatus, writeJson, dbHealthCheck, closeDbPool, migrateLegacySnapshots } from './db.js';
import { serviceErrorHandler, logServiceFailure } from './utils/service-error.js';
import { cleanText, cleanKey, cleanUrl, normalizeList } from './utils/input.js';
import { categories, products } from './menu-data.js';
import { requireAdminApiKey, isAdminApiKeyValid } from './admin-auth.js';
import { createMediaService } from './services/media-service.js';
import { registerMediaRoutes } from './routes/media-routes.js';
import { createCategoryService } from './services/category-service.js';
import { registerCategoryRoutes } from './routes/category-routes.js';
import { createStudioService } from './services/studio-service.js';
import { registerStudioRoutes } from './routes/studio-routes.js';
import { createExperienceService } from './services/experience-service.js';
import { registerExperienceRoutes } from './routes/experience-routes.js';
import { createMemoryService } from './services/memory-service.js';
import { registerMemoriesRoutes } from './routes/memory-routes.js';
import { createRevenueService } from './services/revenue-service.js';
import { createPromotionService } from './services/promotion-service.js';
import { registerPromotionRoutes } from './routes/promotion-routes.js';
import { registerRevenueRoutes } from './routes/revenue-routes.js';
import { createStateRepository } from './repositories/state-repository.js';
import { createStateStore } from './repositories/state-store.js';
import { createOrderService } from './services/order-service.js';
import { registerOrderRoutes } from './routes/order-routes.js';
import { createCustomerService } from './services/customer-service.js';
import { registerCustomerRoutes } from './routes/customer-routes.js';
import { createCustomerRelationshipService } from './services/customer-relationship-service.js';
import { registerCustomerRelationshipRoutes } from './routes/customer-relationship-routes.js';
import { registerProductRoutes } from './routes/product-routes.js';
import { createSmartMenuService } from './services/smart-menu-service.js';
import { createReservationService } from './services/reservation-service.js';
import { registerReservationRoutes } from './routes/reservation-routes.js';
import { createPushSubscriptionService } from './services/push-subscription-service.js';
import { registerPushRoutes } from './routes/push-routes.js';
import { createNotificationService } from './services/notification-service.js';
import { registerNotificationRoutes } from './routes/notification-routes.js';
import { createShamsService } from './services/shams-service.js';
import { registerShamsRoutes } from './routes/shams-routes.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { configureHttpSecurity } from './middleware/http-security.js';
import { createNextPrefixedId } from './utils/id-generator.js';
import { registerPageRoutes } from './routes/page-routes.js';
import { allowedCorsOrigins, isProductionRuntime, maxVideoBytes as MAX_VIDEO_BYTES, menuVersion as MENU_VERSION, port, stateKey as STATE_KEY, videoTypes as VIDEO_TYPES, smartPopularWindowMs as SMART_POPULAR_WINDOW_MS, smartNewWindowMs as SMART_NEW_WINDOW_MS, shamsAiApiKey as SHAMS_AI_API_KEY, shamsAiModel as SHAMS_AI_MODEL, shamsAiEndpoint as SHAMS_AI_ENDPOINT, vapidPublicKey as VAPID_PUBLIC_KEY, vapidPrivateKey as VAPID_PRIVATE_KEY, vapidSubject as VAPID_SUBJECT } from './config.js';

const app = express();
const serverStartedAt = Date.now();
app.set('trust proxy', 1);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
configureHttpSecurity(app, { allowedCorsOrigins, isProductionRuntime });
app.use(express.json({limit:'1mb',strict:true}));

const orders=[]; const customers=[]; const reservations=[]; const pushSubscriptions=[]; const notificationDevices=[];
const reservationRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:8,
  message:'Too many reservation requests. Please try again later.'
});
const orderRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:10,
  message:'Too many order requests. Please try again later.'
});
const orderStatusRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:60,
  message:'Too many order status requests. Please try again later.'
});
const analyticsRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:180,
  message:'Too many analytics events. Please try again later.'
});
const recoveryRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:60,
  message:'Too many recovery link requests. Please try again later.'
});
const promotionClaimRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:5,
  message:'Too many promotion claims. Please try again later.'
});
const promotionQuoteRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:120,
  message:'Too many promotion quote requests. Please try again later.'
});
const memoryUploadRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:20,
  message:'Too many media uploads. Please try again later.'
});
const memoryMutationRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:60,
  message:'Too many community actions. Please try again later.'
});
const pushSubscribeRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:20,
  message:'Too many push subscription requests. Please try again later.'
});
const notificationSendRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:20,
  message:'Too many notification sending requests. Please try again later.'
});
const customerProfileRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:12,
  message:'Too many profile requests. Please try again later.'
});
const customerAdminRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:120,
  message:'Too many customer management requests. Please try again later.'
});
const shamsRateLimit=createRateLimiter({
  windowMs:10*60*1000,
  limit:24,
  message:'Too many Shams requests. Please try again later.'
});
const rateLimiters=[reservationRateLimit,orderRateLimit,orderStatusRateLimit,analyticsRateLimit,recoveryRateLimit,promotionClaimRateLimit,promotionQuoteRateLimit,memoryUploadRateLimit,memoryMutationRateLimit,pushSubscribeRateLimit,notificationSendRateLimit,customerProfileRateLimit,customerAdminRateLimit,shamsRateLimit];
const rateLimitCleanupTimer=setInterval(() => {
  for (const limiter of rateLimiters) limiter.cleanup();
}, 10*60*1000);
rateLimitCleanupTimer.unref();

const stateStore = createStateStore({
  readJsonWithStatus,
  writeJson,
  dbReady,
  stateKey: STATE_KEY,
  menuVersion: MENU_VERSION,
  products,
  customers,
  orders,
  reservations,
  pushSubscriptions,
  notificationDevices
});
const { persist: persistState, flush: flushPersistState } = stateStore;
const stateRepository = createStateRepository({ products, categories, orders, customers, reservations, pushSubscriptions, notificationDevices, persist: persistState });

const smartMenu = createSmartMenuService({
  repository: stateRepository,
  normalizeList,
  presign,
  storageReady,
  smartPopularWindowMs: SMART_POPULAR_WINDOW_MS,
  smartNewWindowMs: SMART_NEW_WINDOW_MS
});
const { smartSnapshot, withMediaUrls, invalidateSmartSnapshot } = smartMenu;

const revenue=createRevenueService({readJsonWithStatus,writeJson,storageReady,repository:stateRepository});
registerRevenueRoutes(app,{service:revenue,requireAdminApiKey,analyticsRateLimit,recoveryRateLimit});

const promotionService=createPromotionService({readJsonWithStatus,writeJson,storageReady});
registerPromotionRoutes(app,{service:promotionService,requireAdminApiKey,claimRateLimit:promotionClaimRateLimit,quoteRateLimit:promotionQuoteRateLimit});
const categoryService=createCategoryService({categoriesRepository:stateRepository.categories,productsRepository:stateRepository.products,storageReady,dbReady,presign,readJsonWithStatus,writeJson,deleteObject,isAdminApiKeyValid});
registerCategoryRoutes(app,{service:categoryService,requireAdminApiKey});
const restoreCategories=categoryService.restore;
const studioService=createStudioService({storageReady,dbReady,presign,readJsonWithStatus,writeJson,deleteObject});
registerStudioRoutes(app,{service:studioService,requireAdminApiKey});
const restoreStudio=studioService.restore;
const experienceService=createExperienceService({storageReady,dbReady,presign,readJsonWithStatus,writeJson,deleteObject,isAdminApiKeyValid});
registerExperienceRoutes(app,{service:experienceService,requireAdminApiKey});
const restoreExperiences=experienceService.restore;
const memoryService=createMemoryService({storageReady,dbReady,presign,readJsonWithStatus,writeJson,writeObject,deleteObject});
registerMemoriesRoutes(app,{service:memoryService,requireAdminApiKey,memoryUploadRateLimit,memoryMutationRateLimit});
const nextProductId = createNextPrefixedId(stateRepository.products, 'P', 3);

app.get('/health',async(_req,res)=>{
  const persistence = stateStore.status();
  const revenuePersistence = revenue.persistenceStatus();
  const promotionPersistence = promotionService.persistenceStatus();
  const database = await dbHealthCheck();
  const ready = (!dbReady || (database.ok && persistence.lastPersistOk !== false)) && revenuePersistence.lastPersistOk !== false && promotionPersistence.lastPersistOk !== false;
  const payload = {
    ok: ready,
    service: 'arabisk-web',
    uptimeSeconds: Math.floor((Date.now()-serverStartedAt)/1000),
    databaseConfigured: dbReady,
    database,
    mediaStorageConfigured: storageReady,
    persistence,
    revenuePersistence,
    promotionPersistence,
    shams: shamsService?.status?.() || { configured: false },
    environment: isProductionRuntime ? 'production' : 'development'
  };
  return res.status(ready ? 200 : 503).json(payload);
});

registerProductRoutes(app, {
  repository: stateRepository.products,
  categories: stateRepository.categories,
  storageReady,
  presign,
  deleteObject,
  requireAdminApiKey,
  isAdminApiKeyValid,
  cleanText,
  cleanKey,
  cleanUrl,
  normalizeList,
  smartSnapshot,
  withMediaUrls,
  invalidateSmartSnapshot,
  nextProductId,
  maxVideoBytes: MAX_VIDEO_BYTES,
  videoTypes: VIDEO_TYPES
});


const notifyCustomer = (...args) => notificationService?.notifyCustomer?.(...args);

const orderService = createOrderService({
  repository: stateRepository,
  cleanText,
  nextOrderId: createNextPrefixedId(stateRepository.orders, 'O', 5),
  invalidateSmartSnapshot,
  revenue,
  crypto,
  promotions: promotionService,
  notifyCustomer
});

registerOrderRoutes(app, {
  service: orderService,
  requireAdminApiKey,
  orderRateLimit,
  orderStatusRateLimit
});

const customerService = createCustomerService({
  repository: stateRepository,
  cleanText,
  crypto
});

const customerRelationshipService = createCustomerRelationshipService({
  repository: stateRepository
});

registerCustomerRelationshipRoutes(app, {
  service: customerRelationshipService,
  requireAdminApiKey,
  rateLimit: customerAdminRateLimit,
  findCustomerByProfileToken: customerService.findByProfileToken
});

registerCustomerRoutes(app, {
  service: customerService,
  requireAdminApiKey,
  profileRateLimit: customerProfileRateLimit
});

const shamsService = createShamsService({
  repository: stateRepository,
  findCustomerByProfileToken: customerService.findByProfileToken,
  readJsonWithStatus,
  writeJson,
  aiApiKey: SHAMS_AI_API_KEY,
  aiModel: SHAMS_AI_MODEL,
  aiEndpoint: SHAMS_AI_ENDPOINT,
  getOrderService: () => orderService,
  getReservationService: () => reservationService,
  getCustomerRelationship: customerRelationshipService.shamsContext
});
registerShamsRoutes(app, { service: shamsService, profileRateLimit: shamsRateLimit });

const reservationService = createReservationService({
  repository: stateRepository,
  cleanText,
  nextReservationId: createNextPrefixedId(stateRepository.reservations, 'R', 4),
  findBookableExperience: experienceService.findBookable,
  revenue,
  crypto,
  notifyCustomer
});

registerReservationRoutes(app, {
  service: reservationService,
  requireAdminApiKey,
  reservationRateLimit
});

const pushSubscriptionService = createPushSubscriptionService({
  repository: stateRepository,
  cleanText,
  crypto,
  findCustomerByProfileToken: customerService.findByProfileToken
});

registerPushRoutes(app, {
  service: pushSubscriptionService,
  pushSubscribeRateLimit,
  vapidPublicKey: VAPID_PUBLIC_KEY
});

const notificationService = createNotificationService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  pushSubscriptionsRepository: stateRepository.pushSubscriptions,
  notificationDevicesRepository: stateRepository.notificationDevices,
  customers,
  orders,
  reservations,
  vapidPrivateKey: VAPID_PRIVATE_KEY,
  vapidPublicKey: VAPID_PUBLIC_KEY,
  vapidSubject: VAPID_SUBJECT
});
registerNotificationRoutes(app, {
  service: notificationService,
  requireAdminApiKey,
  sendRateLimit: notificationSendRateLimit
});

const mediaService = createMediaService({
  repository: stateRepository.products,
  storageReady,
  dbReady,
  readJsonWithStatus,
  writeJson,
  presign
});
registerMediaRoutes(app, {
  service: mediaService,
  requireAdminApiKey
});
registerPageRoutes(app, { rootDir: __dirname, distDir: dist });
app.use(serviceErrorHandler);

console.log(`ARABISK persistence bootstrap — database=${dbReady} storage=${storageReady}`);
if (dbReady && storageReady) {
  const migration = await migrateLegacySnapshots();
  if (!migration.ok) throw new Error(`Legacy data migration failed: ${migration.reason}`);
  console.log(`ARABISK legacy migration — alreadyMigrated=${migration.alreadyMigrated} migrated=${migration.migrated.length} missing=${migration.missing.length}`);
}
await stateStore.restore();
await restoreCategories();
await restoreStudio();
await restoreExperiences();
await memoryService.restore();
await revenue.restoreRevenue();
await promotionService.restore();
await notificationService.restore();
console.log(`ARABISK notification bootstrap — configured=${notificationService.getStatus().configured} installedDevices=${notificationService.getStatus().installedDevices} installedSubscribers=${notificationService.getStatus().subscribers}`);
console.log(`ARABISK Shams bootstrap — configured=${shamsService.status().configured} provider=${shamsService.status().provider} model=${shamsService.status().model}`);
if(dbReady){
  persistState();
  await flushPersistState();
}
const server=app.listen(port,()=>console.log(`ARABISK web listening on ${port} — ${products.length} menu items, ${categories.length} categories, ${orders.length} orders, ${customers.length} customers, ${reservations.length} reservations`));
server.requestTimeout=30_000;
server.headersTimeout=35_000;
server.keepAliveTimeout=5_000;
let shuttingDown=false;
const shutdown=(signal)=>{
  if(shuttingDown)return;
  shuttingDown=true;
  console.log(`ARABISK web received ${signal}; shutting down gracefully`);
  const forceExit=setTimeout(()=>process.exit(1),10000);
  forceExit.unref();
  server.close(async()=>{
    clearTimeout(forceExit);
    try{
      await flushPersistState();
      await revenue.flushPersistRevenue();
      await promotionService.flushPersistence();
      await notificationService.flushPersistence();
      await closeDbPool();
    }catch(error){
      logServiceFailure(error, { service: 'web', operation: 'shutdown-flush' });
    }
    process.exit(0);
  });
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
