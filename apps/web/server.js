import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { presign, storageReady, readJson, writeJson, deleteObject } from './storage.js';
import { serviceErrorHandler } from './utils/service-error.js';
import { cleanText, cleanKey, cleanUrl, normalizeList } from './utils/input.js';
import { categories, products } from './menu-data.js';
import { requireAdminApiKey, isAdminApiKeyValid } from './admin-auth.js';
import { createMediaService } from './services/media-service.js';
import { registerMediaRoutes } from './routes/media-routes.js';
import { createCategoryService } from './services/category-service.js';
import { registerCategoryRoutes } from './routes/category-routes.js';
import { createStudioService } from './services/studio-service.js';
import { registerStudioRoutes } from './routes/studio-routes.js';
import { createExperienceService, experiences } from './services/experience-service.js';
import { registerExperienceRoutes } from './routes/experience-routes.js';
import { createMemoryService } from './services/memory-service.js';
import { registerMemoriesRoutes } from './routes/memory-routes.js';
import { createRevenueService } from './services/revenue-service.js';
import { registerRevenueRoutes } from './routes/revenue-routes.js';
import { createStateRepository } from './repositories/state-repository.js';
import { createStateStore } from './repositories/state-store.js';
import { createOrderService } from './services/order-service.js';
import { registerOrderRoutes } from './routes/order-routes.js';
import { createCustomerService } from './services/customer-service.js';
import { registerCustomerRoutes } from './routes/customer-routes.js';
import { registerProductRoutes } from './routes/product-routes.js';
import { createSmartMenuService } from './services/smart-menu-service.js';
import { createReservationService } from './services/reservation-service.js';
import { registerReservationRoutes } from './routes/reservation-routes.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { configureHttpSecurity } from './middleware/http-security.js';
import { createNextPrefixedId } from './utils/id-generator.js';
import { registerPageRoutes } from './routes/page-routes.js';
import { allowedCorsOrigins, isProductionRuntime, maxVideoBytes as MAX_VIDEO_BYTES, menuVersion as MENU_VERSION, port, stateKey as STATE_KEY, videoTypes as VIDEO_TYPES, smartPopularWindowMs as SMART_POPULAR_WINDOW_MS, smartNewWindowMs as SMART_NEW_WINDOW_MS } from './config.js';

const app = express();
const serverStartedAt = Date.now();
app.set('trust proxy', 1);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
configureHttpSecurity(app, { allowedCorsOrigins, isProductionRuntime });
app.use(express.json({limit:'1mb',strict:true}));

const orders=[]; const customers=[]; const reservations=[];
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
const rateLimiters=[reservationRateLimit,orderRateLimit,orderStatusRateLimit,analyticsRateLimit,memoryUploadRateLimit,memoryMutationRateLimit];
const rateLimitCleanupTimer=setInterval(() => {
  for (const limiter of rateLimiters) limiter.cleanup();
}, 10*60*1000);
rateLimitCleanupTimer.unref();

const stateStore = createStateStore({
  readJson,
  writeJson,
  storageReady,
  stateKey: STATE_KEY,
  menuVersion: MENU_VERSION,
  products,
  customers,
  orders,
  reservations
});
const { persist: persistState, flush: flushPersistState } = stateStore;
const stateRepository = createStateRepository({ products, categories, orders, customers, reservations, persist: persistState });

const smartMenu = createSmartMenuService({
  repository: stateRepository,
  normalizeList,
  presign,
  storageReady,
  smartPopularWindowMs: SMART_POPULAR_WINDOW_MS,
  smartNewWindowMs: SMART_NEW_WINDOW_MS
});
const { smartSnapshot, withMediaUrls, invalidateSmartSnapshot } = smartMenu;

const revenue=createRevenueService({readJson,writeJson,storageReady,repository:stateRepository});
registerRevenueRoutes(app,{service:revenue,requireAdminApiKey,analyticsRateLimit});
const categoryService=createCategoryService({categoriesRepository:stateRepository.categories,productsRepository:stateRepository.products,storageReady,presign,readJson,writeJson,deleteObject,isAdminApiKeyValid});
registerCategoryRoutes(app,{service:categoryService,requireAdminApiKey});
const restoreCategories=categoryService.restore;
const studioService=createStudioService({storageReady,presign,readJson,writeJson,deleteObject});
registerStudioRoutes(app,{service:studioService,requireAdminApiKey});
const restoreStudio=studioService.restore;
const experienceService=createExperienceService({storageReady,presign,readJson,writeJson,deleteObject,isAdminApiKeyValid});
registerExperienceRoutes(app,{service:experienceService,requireAdminApiKey});
const restoreExperiences=experienceService.restore;
const memoryService=createMemoryService({storageReady,presign,readJson,writeJson,deleteObject});
registerMemoriesRoutes(app,{service:memoryService,requireAdminApiKey,memoryUploadRateLimit,memoryMutationRateLimit});
const nextProductId = createNextPrefixedId(stateRepository.products, 'P', 3);

app.get('/health',(_req,res)=>{
  const persistence = stateStore.status();
  const ready = !storageReady || persistence.lastPersistOk !== false;
  const payload = {
    ok: ready,
    service: 'arabisk-web',
    uptimeSeconds: Math.floor((Date.now()-serverStartedAt)/1000),
    storageConfigured: storageReady,
    persistence,
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


const orderService = createOrderService({
  repository: stateRepository,
  cleanText,
  nextOrderId: createNextPrefixedId(stateRepository.orders, 'O', 5),
  invalidateSmartSnapshot,
  revenue,
  crypto
});

registerOrderRoutes(app, {
  service: orderService,
  requireAdminApiKey,
  orderRateLimit,
  orderStatusRateLimit
});

const customerService = createCustomerService({
  repository: stateRepository,
  cleanText
});

registerCustomerRoutes(app, {
  service: customerService,
  requireAdminApiKey
});

const reservationService = createReservationService({
  repository: stateRepository,
  cleanText,
  nextReservationId: createNextPrefixedId(stateRepository.reservations, 'R', 4),
  experiences,
  revenue,
  crypto
});

registerReservationRoutes(app, {
  service: reservationService,
  requireAdminApiKey,
  reservationRateLimit
});

const mediaService = createMediaService({
  repository: stateRepository.products,
  storageReady,
  readJson,
  writeJson,
  presign
});
registerMediaRoutes(app, {
  service: mediaService,
  requireAdminApiKey
});
registerPageRoutes(app, { rootDir: __dirname, distDir: dist });
app.use(serviceErrorHandler);

await stateStore.restore();
await restoreCategories();
await restoreStudio();
await restoreExperiences();
await memoryService.restore();
await revenue.restoreRevenue();
if(storageReady){
  persistState();
  await flushPersistState();
}
const server=app.listen(port,()=>console.log(`ARABISK web listening on ${port} — ${products.length} menu items, ${categories.length} categories`));
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
    }catch(error){
      console.error('State flush failed during shutdown:',error);
    }
    process.exit(0);
  });
};
process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
