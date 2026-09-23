import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { presign, storageReady, readJson, writeJson, deleteObject } from './storage.js';
import { categories, products } from './menu-data.js';
import { requireAdminApiKey, isAdminApiKeyValid } from './admin-auth.js';
import { registerMediaRoutes } from './media-routes.js';
import { registerCategoryRoutes } from './category-routes.js';
import { registerStudioRoutes } from './studio-routes.js';
import { registerExperienceRoutes, experiences } from './experience-routes.js';
import { registerMemoriesRoutes } from './memories-routes.js';
import { registerRevenueRoutes } from './revenue-engine.js';
import { createStateRepository } from './repositories/state-repository.js';
import { registerOrderRoutes } from './services/order-service.js';
import { registerCustomerRoutes } from './services/customer-service.js';
import { registerProductRoutes } from './routes/product-routes.js';
import { registerReservationRoutes } from './services/reservation-service.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { allowedCorsOrigins, isProductionRuntime, maxVideoBytes as MAX_VIDEO_BYTES, menuVersion as MENU_VERSION, port, stateKey as STATE_KEY, videoTypes as VIDEO_TYPES } from './config.js';

const app = express();
const serverStartedAt = Date.now();
app.set('trust proxy', 1);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const corsOptions = { origin(origin, callback){ if(!origin || allowedCorsOrigins.has(origin)) return callback(null,true); return callback(null,false); }, methods:['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders:['Content-Type','X-Arabisk-Admin-Key'] };
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
const requestId=(req)=>String(req.get('X-Request-Id')||crypto.randomUUID()).slice(0,80);
const errorRouteForLog=(req)=>{
  const matchedRoute=req.route?.path;
  if(matchedRoute)return String(matchedRoute).slice(0,160);
  if(req.path.startsWith('/api/')){
    const segments=req.path.split('/').filter(Boolean);
    return '/' + segments.slice(0,2).join('/');
  }
  return req.path.slice(0,160);
};

app.use((req,res,next)=>{
  const id=requestId(req);
  res.locals.requestId=id;
  const startedAt=process.hrtime.bigint();
  res.on('finish',()=>{
    if(res.statusCode<500)return;
    const durationMs=Number(process.hrtime.bigint()-startedAt)/1e6;
    console.error(JSON.stringify({
      event:'http_server_error',
      requestId:id,
      method:req.method,
      route:errorRouteForLog(req),
      status:res.statusCode,
      durationMs:Math.round(durationMs*100)/100
    }));
  });
  res.setHeader('X-Request-Id',id);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  if(req.secure||process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  if(req.path==='/health'||req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.json({limit:'1mb',strict:true}));

const cleanText=(value,max=180)=>String(value??'').trim().slice(0,max);
const cleanKey=(value)=>String(value??'').trim().replace(/^\/+/, '').slice(0,500);
const cleanUrl=(value)=>String(value??'').trim().slice(0,1000);
const normalizeList=(value,allowed,max=8)=>Array.isArray(value)?[...new Set(value.map(item=>String(item??'').trim().toLowerCase()).filter(item=>allowed.has(item)))].slice(0,max):[];
const SMART_TAGS=new Set(['spicy']);
const DIETARY_TAGS=new Set(['vegetarian','vegan','gluten-free']);

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
const rateLimiters=[reservationRateLimit,orderRateLimit,orderStatusRateLimit,analyticsRateLimit];
const rateLimitCleanupTimer=setInterval(() => {
  for (const limiter of rateLimiters) limiter.cleanup();
}, 10*60*1000);
rateLimitCleanupTimer.unref();

const SMART_SNAPSHOT_CACHE_MS=30*1000;
let smartSnapshotCache=null;
let smartSnapshotCachedAt=0;
function smartSnapshot(force=false){
  const now=Date.now();
  if(!force&&smartSnapshotCache&&now-smartSnapshotCachedAt<SMART_SNAPSHOT_CACHE_MS)return smartSnapshotCache;
  const cutoff=now-SMART_POPULAR_WINDOW_MS;
  const sales=new Map();
  for(const order of orders){
    if(order.status==='cancelled') continue;
    const created=Date.parse(order.createdAt||'');
    if(!Number.isFinite(created)||created<cutoff) continue;
    for(const item of Array.isArray(order.items)?order.items:[]) sales.set(item.productId,(sales.get(item.productId)||0)+Number(item.quantity||0));
  }
  const popularIds=new Set([...sales.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>id));
  smartSnapshotCache={sales,popularIds};
  smartSnapshotCachedAt=now;
  return smartSnapshotCache;
}
const invalidateSmartSnapshot=()=>{smartSnapshotCache=null;smartSnapshotCachedAt=0};
function smartMeta(product,snapshot){
  const tags=normalizeList(product.tags,SMART_TAGS);
  const dietary=normalizeList(product.dietary,DIETARY_TAGS);
  const created=Date.parse(product.createdAt||'');
  const isNew=Boolean(product.isNew)||(Number.isFinite(created)&&Date.now()-created<=SMART_NEW_WINDOW_MS);
  const chefChoice=Boolean(product.chefChoice);
  const spiceLevel=Math.max(0,Math.min(3,Number(product.spiceLevel)||0));
  return {popular:snapshot.popularIds.has(product.id),isNew,chefChoice,spicy:tags.includes('spicy')||spiceLevel>0,vegetarian:dietary.includes('vegetarian'),vegan:dietary.includes('vegan'),glutenFree:dietary.includes('gluten-free'),spiceLevel,tags,dietary};
}
const MEDIA_URL_CACHE_MS=60*1000;
const MAX_MEDIA_URL_CACHE=1000;
const mediaUrlCache=new Map();
const cachedMediaUrl=(method,key)=>{
  const cacheKey=method+':'+key;
  const now=Date.now();
  const cached=mediaUrlCache.get(cacheKey);
  if(cached&&now-cached.createdAt<MEDIA_URL_CACHE_MS)return cached.url;
  const url=presign(method,key,900);
  if(!cached&&mediaUrlCache.size>=MAX_MEDIA_URL_CACHE){
    const oldestKey=mediaUrlCache.keys().next().value;
    if(oldestKey!==undefined)mediaUrlCache.delete(oldestKey);
  }
  mediaUrlCache.set(cacheKey,{createdAt:now,url});
  return url;
};
const withMediaUrls=(product,snapshot=smartSnapshot())=>({...product,imageUrl:product.imageKey&&storageReady?cachedMediaUrl('GET',product.imageKey):(product.imageUrl||''),videoUrl:product.videoKey&&storageReady?cachedMediaUrl('GET',product.videoKey):'',smart:smartMeta(product,snapshot)});

const rebuildCustomerOrderStats=()=>{
  const statsByPhone=new Map();
  for(const order of orders){
    if(order.status!=='completed'||order.orderType!=='pickup'||!order.phone)continue;
    const current=statsByPhone.get(order.phone)||{count:0,lastOrderAt:''};
    current.count+=1;
    const completedAt=order.completedAt||order.createdAt||'';
    if(completedAt&&(!current.lastOrderAt||completedAt>current.lastOrderAt))current.lastOrderAt=completedAt;
    statsByPhone.set(order.phone,current);
  }
  for(const customer of customers){
    const stats=statsByPhone.get(customer.phone);
    customer.orderCount=stats?.count||0;
    customer.lastOrderAt=stats?.lastOrderAt||'';
  }
};
async function restoreState(){ if(!storageReady) return; const saved=await readJson(STATE_KEY,null); if(!saved||typeof saved!=='object') return; if(saved.menuVersion===MENU_VERSION&&Array.isArray(saved.products)&&saved.products.length) products.splice(0,products.length,...saved.products); if(Array.isArray(saved.orders)) orders.splice(0,orders.length,...saved.orders); if(Array.isArray(saved.customers)) customers.splice(0,customers.length,...saved.customers); if(Array.isArray(saved.reservations)) reservations.splice(0,reservations.length,...saved.reservations); rebuildCustomerOrderStats(); }
const PERSIST_DEBOUNCE_MS=250;
let persistQueue=Promise.resolve();
let persistTimer=null;
let persistRequested=false;

const flushPersistState=()=>{
  if(persistTimer){
    clearTimeout(persistTimer);
    persistTimer=null;
  }
  if(!persistRequested)return persistQueue;
  persistRequested=false;
  const snapshot=structuredClone({menuVersion:MENU_VERSION,products,orders,customers,reservations});
  persistQueue=persistQueue.catch(()=>{}).then(()=>writeJson(STATE_KEY,snapshot));
  return persistQueue;
};

const persistState=()=>{
  persistRequested=true;
  if(!persistTimer){
    persistTimer=setTimeout(()=>flushPersistState(),PERSIST_DEBOUNCE_MS);
    persistTimer.unref();
  }
  return persistQueue;
};
const revenue=registerRevenueRoutes(app,{readJson,writeJson,storageReady,requireAdminApiKey,customers,reservations,orders,products,analyticsRateLimit});
const restoreCategories=registerCategoryRoutes(app,{categories,products,storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey,isAdminApiKeyValid});
const restoreStudio=registerStudioRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey});
const restoreExperiences=registerExperienceRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey,isAdminApiKeyValid});
const memories=registerMemoriesRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey});
const nextProductId=()=>{const max=products.reduce((highest,product)=>Math.max(highest,Number(String(product.id).replace(/^P/,''))||0),0);return `P${String(max+1).padStart(3,'0')}`};

app.get('/health',(_req,res)=>res.json({ok:true,service:'arabisk-web',uptimeSeconds:Math.floor((Date.now()-serverStartedAt)/1000),storageConfigured:storageReady,environment:isProductionRuntime?'production':'development'}));
registerProductRoutes(app, {
  products,
  categories,
  storageReady,
  presign,
  deleteObject,
  isAdminApiKeyValid,
  cleanText,
  cleanKey,
  cleanUrl,
  normalizeList,
  smartSnapshot,
  withMediaUrls,
  persistState,
  invalidateSmartSnapshot,
  nextProductId,
  maxVideoBytes: MAX_VIDEO_BYTES,
  videoTypes: VIDEO_TYPES
});

const stateRepository = createStateRepository({ orders, customers, reservations, persist: persistState });

registerOrderRoutes(app, {
  repository: stateRepository,
  products,
  requireAdminApiKey,
  orderRateLimit,
  orderStatusRateLimit,
  cleanText,
  nextOrderId: () => {
    const max = orders.reduce((highest, order) => Math.max(highest, Number(String(order.id).replace(/^O/, '')) || 0), 0);
    return `O${String(max + 1).padStart(5, '0')}`;
  },
  invalidateSmartSnapshot,
  revenue,
  crypto
});

registerCustomerRoutes(app, {
  repository: stateRepository,
  requireAdminApiKey,
  cleanText
});

registerReservationRoutes(app, {
  repository: stateRepository,
  requireAdminApiKey,
  reservationRateLimit,
  cleanText,
  nextReservationId: () => {
    const max = reservations.reduce((highest, reservation) => Math.max(highest, Number(String(reservation.id).replace(/^R/, '')) || 0), 0);
    return `R${String(max + 1).padStart(4, '0')}`;
  },
  experiences,
  revenue,
  crypto
});

registerMediaRoutes(app,{products,storageReady,presign,requireAdminApiKey});
app.get('/cart',(req,res)=>res.sendFile(path.join(__dirname,'cart-page.html')));
app.get('/track-order',(req,res)=>res.sendFile(path.join(__dirname,'order-tracking.html')));
app.get('/events',(req,res)=>res.sendFile(path.join(__dirname,'events.html')));
app.get('/memories',(req,res)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.sendFile(path.join(__dirname,'memories.html'));});
app.get(/^\/events\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'event-page.html')));
app.get('/menu',(req,res)=>res.sendFile(path.join(__dirname,'menu.html')));
app.get(/^\/menu\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'category-page.html')));
app.get(/^\/menu\/[^/]+\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'product-page.html')));

app.use(express.static(dist));app.use((_req,res)=>res.sendFile(path.join(dist,'index.html')));app.use((error,req,res,_next)=>{
  if(error?.type==='entity.too.large')return res.status(413).json({message:'Request body is too large.'});
  if(error instanceof SyntaxError&&error?.status===400)return res.status(400).json({message:'Invalid JSON request.'});
  console.error(JSON.stringify({event:'web_unhandled_error',requestId:res.locals.requestId||'unknown',method:req.method,path:req.path,error:String(error?.message||error)}));
  if(!res.headersSent)res.status(500).json({message:'Internal server error'});
});

await restoreState();await restoreCategories();await restoreStudio();await restoreExperiences();await memories.restore();await revenue.restoreRevenue();if(storageReady)persistState();
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
