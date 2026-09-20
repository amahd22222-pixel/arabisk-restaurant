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
import { registerRevenueRoutes } from './revenue-engine.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const STATE_KEY = 'data/arabisk-state.json';
const MENU_VERSION = 2;
const allowedCorsOrigins = new Set(['https://arabiskadmin-production.up.railway.app','http://localhost:4174','http://127.0.0.1:4174','http://localhost:5173','http://127.0.0.1:5173']);
const corsOptions = { origin(origin, callback){ if(!origin || allowedCorsOrigins.has(origin)) return callback(null,true); return callback(null,false); }, methods:['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders:['Content-Type','X-Arabisk-Admin-Key'] };
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()'); if(req.path==='/health'||req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store'); next(); });
app.use(express.json({limit:'1mb'}));

const cleanText=(value,max=180)=>String(value??'').trim().slice(0,max);
const cleanKey=(value)=>String(value??'').trim().replace(/^\/+/, '').slice(0,500);
const cleanUrl=(value)=>String(value??'').trim().slice(0,1000);
const normalizeList=(value,allowed,max=8)=>Array.isArray(value)?[...new Set(value.map(item=>String(item??'').trim().toLowerCase()).filter(item=>allowed.has(item)))].slice(0,max):[];
const SMART_TAGS=new Set(['spicy']);
const DIETARY_TAGS=new Set(['vegetarian','vegan','gluten-free']);

const orders=[]; const customers=[]; const reservations=[];
const reservationRate=new Map(); const orderRate=new Map(); const orderStatusRate=new Map();
const RESERVATION_RATE_WINDOW_MS=10*60*1000; const RESERVATION_RATE_LIMIT=8;
const ORDER_RATE_WINDOW_MS=10*60*1000; const ORDER_RATE_LIMIT=10;
const ORDER_STATUS_RATE_WINDOW_MS=10*60*1000; const ORDER_STATUS_RATE_LIMIT=60;
const SMART_POPULAR_WINDOW_MS=7*24*60*60*1000;
const SMART_NEW_WINDOW_MS=30*24*60*60*1000;
const getClientKey=(req)=>String(req.ip||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim().slice(0,120)||'unknown';
const createRateLimit=(store,windowMs,limit,message)=>(req,res,next)=>{const now=Date.now(),key=getClientKey(req),previous=store.get(key);if(!previous||now-previous.startedAt>=windowMs){store.set(key,{startedAt:now,count:1});return next()}if(previous.count>=limit){const retryAfter=Math.max(1,Math.ceil((windowMs-(now-previous.startedAt))/1000));res.setHeader('Retry-After',String(retryAfter));return res.status(429).json({message,retryAfter})}previous.count+=1;return next()};
const reservationRateLimit=createRateLimit(reservationRate,RESERVATION_RATE_WINDOW_MS,RESERVATION_RATE_LIMIT,'Too many reservation requests. Please try again later.');
const orderRateLimit=createRateLimit(orderRate,ORDER_RATE_WINDOW_MS,ORDER_RATE_LIMIT,'Too many order requests. Please try again later.');
const orderStatusRateLimit=createRateLimit(orderStatusRate,ORDER_STATUS_RATE_WINDOW_MS,ORDER_STATUS_RATE_LIMIT,'Too many order status requests. Please try again later.');
setInterval(()=>{const now=Date.now();for(const [key,entry] of reservationRate)if(now-entry.startedAt>RESERVATION_RATE_WINDOW_MS*2)reservationRate.delete(key);for(const [key,entry] of orderRate)if(now-entry.startedAt>ORDER_RATE_WINDOW_MS*2)orderRate.delete(key);for(const [key,entry] of orderStatusRate)if(now-entry.startedAt>ORDER_STATUS_RATE_WINDOW_MS*2)orderStatusRate.delete(key)},Math.min(RESERVATION_RATE_WINDOW_MS,ORDER_RATE_WINDOW_MS,ORDER_STATUS_RATE_WINDOW_MS)).unref();

function smartSnapshot(){
  const cutoff=Date.now()-SMART_POPULAR_WINDOW_MS;
  const sales=new Map();
  for(const order of orders){
    if(order.status==='cancelled') continue;
    const created=Date.parse(order.createdAt||'');
    if(!Number.isFinite(created)||created<cutoff) continue;
    for(const item of Array.isArray(order.items)?order.items:[]) sales.set(item.productId,(sales.get(item.productId)||0)+Number(item.quantity||0));
  }
  const popularIds=new Set([...sales.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>id));
  return {sales,popularIds};
}
function smartMeta(product,snapshot){
  const tags=normalizeList(product.tags,SMART_TAGS);
  const dietary=normalizeList(product.dietary,DIETARY_TAGS);
  const created=Date.parse(product.createdAt||'');
  const isNew=Boolean(product.isNew)||(Number.isFinite(created)&&Date.now()-created<=SMART_NEW_WINDOW_MS);
  const chefChoice=Boolean(product.chefChoice);
  const spiceLevel=Math.max(0,Math.min(3,Number(product.spiceLevel)||0));
  return {popular:snapshot.popularIds.has(product.id),isNew,chefChoice,spicy:tags.includes('spicy')||spiceLevel>0,vegetarian:dietary.includes('vegetarian'),vegan:dietary.includes('vegan'),glutenFree:dietary.includes('gluten-free'),spiceLevel,tags,dietary};
}
const withMediaUrls=(product,snapshot=smartSnapshot())=>({...product,imageUrl:product.imageKey&&storageReady?presign('GET',product.imageKey,900):(product.imageUrl||''),videoUrl:product.videoKey&&storageReady?presign('GET',product.videoKey,900):'',smart:smartMeta(product,snapshot)});

async function restoreState(){ if(!storageReady) return; const saved=await readJson(STATE_KEY,null); if(!saved||typeof saved!=='object') return; if(saved.menuVersion===MENU_VERSION&&Array.isArray(saved.products)&&saved.products.length) products.splice(0,products.length,...saved.products); if(Array.isArray(saved.orders)) orders.splice(0,orders.length,...saved.orders); if(Array.isArray(saved.customers)) customers.splice(0,customers.length,...saved.customers); if(Array.isArray(saved.reservations)) reservations.splice(0,reservations.length,...saved.reservations); }
let persistQueue=Promise.resolve();
const persistState=()=>{
  const snapshot=structuredClone({menuVersion:MENU_VERSION,products,orders,customers,reservations});
  persistQueue=persistQueue.catch(()=>{}).then(()=>writeJson(STATE_KEY,snapshot));
  return persistQueue;
};
const revenue=registerRevenueRoutes(app,{readJson,writeJson,storageReady,requireAdminApiKey,customers,reservations,orders,products});
const restoreCategories=registerCategoryRoutes(app,{categories,products,storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey,isAdminApiKeyValid});
const restoreStudio=registerStudioRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey});
const restoreExperiences=registerExperienceRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey,isAdminApiKeyValid});
const nextProductId=()=>{const max=products.reduce((highest,product)=>Math.max(highest,Number(String(product.id).replace(/^P/,''))||0),0);return `P${String(max+1).padStart(3,'0')}`;};
const nextOrderId=()=>`O${String(orders.length+1).padStart(5,'0')}`;
const nextReservationId=()=>`R${String(reservations.length+1).padStart(4,'0')}`;

app.get('/health',(_req,res)=>res.json({ok:true,service:'arabisk-web',storageReady,persistentStorage:storageReady,menuVersion:MENU_VERSION,productCount:products.length,categoryCount:categories.length,orderCount:orders.length}));
app.get('/api/orders',requireAdminApiKey,(_req,res)=>res.json(orders));
app.get('/api/customers',requireAdminApiKey,(_req,res)=>res.json(customers));
app.get('/api/reservations',requireAdminApiKey,(_req,res)=>res.json(reservations));
const ORDER_STATUS_TRANSITIONS={pending:new Set(['confirmed','cancelled']),confirmed:new Set(['preparing','cancelled']),preparing:new Set(['ready','cancelled']),ready:new Set(['completed','cancelled']),completed:new Set([]),cancelled:new Set([])};
app.patch('/api/orders/:id',requireAdminApiKey,(req,res)=>{const order=orders.find(item=>item.id===req.params.id);if(!order)return res.status(404).json({message:'Order not found'});if(req.body?.status!==undefined){const nextStatus=String(req.body.status);if(!ORDER_STATUS_TRANSITIONS[order.status]?.has(nextStatus))return res.status(409).json({message:`Invalid order status transition: ${order.status} -> ${nextStatus}`});order.status=nextStatus;}if(req.body?.notes!==undefined)order.notes=cleanText(req.body.notes,300);order.updatedAt=new Date().toISOString();persistState();return res.json(order);});

app.post('/api/reservations',reservationRateLimit,(req,res)=>{const b=req.body||{};const name=cleanText(b.name,80),phone=cleanText(b.phone,40),date=cleanText(b.date,20),time=cleanText(b.time,10),guests=Number(b.guests),notes=cleanText(b.notes,300),eventSlug=cleanText(b.eventSlug,90).toLowerCase();const dateOk=/^\d{4}-\d{2}-\d{2}$/.test(date);const timeOk=/^([01]\d|2[0-3]):[0-5]\d$/.test(time);const today=new Date().toISOString().slice(0,10);if(!name||!phone||!date||!time||!Number.isInteger(guests)||guests<1||guests>20)return res.status(400).json({message:'name, phone, date, time and guests are required'});if(!dateOk||date<today)return res.status(400).json({message:'Reservation date must be a valid date that is not in the past.'});if(!timeOk)return res.status(400).json({message:'Reservation time must be in HH:MM format.'});if(eventSlug){const experience=experiences.find(item=>item.slug===eventSlug&&item.status==='published');if(!experience||experience.bookingEnabled===false)return res.status(400).json({message:'Selected experience is not available for booking.'});const endTime=Date.parse(experience.endsAt||experience.startsAt||'');if(Number.isFinite(endTime)&&endTime<=Date.now())return res.status(400).json({message:'Selected experience is no longer accepting bookings.'});}const duplicate=reservations.find(item=>item.status!=='cancelled'&&item.phone===phone&&item.date===date&&item.time===time);if(duplicate)return res.status(409).json({message:'A reservation already exists for this phone, date and time.',reservationId:duplicate.id});const reservation={id:nextReservationId(),name,phone,date,time,guests,notes,eventSlug,status:'pending',createdAt:new Date().toISOString()};reservations.push(reservation);const reservationCustomer=customers.find(customer=>customer.phone===phone);const reservationCustomerId=reservationCustomer?.id||crypto.randomUUID();if(reservationCustomer){reservationCustomer.name=name;reservationCustomer.reservationCount=Number(reservationCustomer.reservationCount||0)+1;reservationCustomer.lastReservationAt=reservation.createdAt;}else customers.push({id:reservationCustomerId,name,phone,orderCount:0,lastOrderAt:'',reservationCount:1,lastReservationAt:reservation.createdAt});revenue.recordEvent({eventName:'reservation_created',sessionId:cleanText(b.sessionId,100),customerId:reservationCustomerId,reservationId:reservation.id});persistState();return res.status(201).json(reservation);});
app.post('/api/orders',orderRateLimit,(req,res)=>{const b=req.body||{};const orderType=['dine_in','pickup'].includes(b.orderType)?b.orderType:'dine_in';const tableNumber=orderType==='dine_in'?cleanText(b.tableNumber,30):'';const name=cleanText(b.name,80);const phone=cleanText(b.phone,40);const notes=cleanText(b.notes,300);const rawItems=Array.isArray(b.items)?b.items:[];if(!rawItems.length||rawItems.length>30)return res.status(400).json({message:'At least one order item is required'});if(orderType==='dine_in'&&!tableNumber)return res.status(400).json({message:'Table number is required for dine-in orders.'});if(orderType==='pickup'&&(!name||phone.length<5||phone.length>40))return res.status(400).json({message:'name and phone are required for pickup orders'});const merged=new Map();for(const raw of rawItems){const productId=cleanText(raw?.productId,40),quantity=Number(raw?.quantity);if(!productId||!Number.isInteger(quantity)||quantity<1||quantity>20)return res.status(400).json({message:'Invalid order item.'});const mergedQuantity=(merged.get(productId)||0)+quantity;if(mergedQuantity>20)return res.status(400).json({message:'Maximum quantity for a single item is 20.'});merged.set(productId,mergedQuantity);}const items=[];let total=0;for(const [productId,quantity] of merged){const product=products.find(item=>item.id===productId&&item.available!==false);if(!product)return res.status(400).json({message:'One or more selected items are no longer available.'});const unitPrice=Number(product.price);if(!Number.isFinite(unitPrice)||unitPrice<0)return res.status(400).json({message:'Invalid product price.'});const lineTotal=unitPrice*quantity;items.push({productId:product.id,nameAr:cleanText(product.nameAr,160),nameEn:cleanText(product.nameEn,160),quantity,unitPrice,lineTotal});total+=lineTotal;}const now=new Date().toISOString();const storedName=orderType==='dine_in'?'طاولة '+tableNumber:name;const storedPhone=orderType==='dine_in'?'':phone;const order={id:nextOrderId(),name:storedName,phone:storedPhone,orderType,tableNumber,notes,items,total,status:'pending',createdAt:now,updatedAt:now};orders.push(order);let orderCustomerId='';if(orderType==='pickup'&&phone){const existing=customers.find(customer=>customer.phone===phone);if(existing){orderCustomerId=existing.id;existing.name=name;existing.lastOrderAt=now;existing.orderCount=Number(existing.orderCount||0)+1}else{orderCustomerId=crypto.randomUUID();customers.push({id:orderCustomerId,name,phone,orderCount:1,lastOrderAt:now});}}revenue.recordEvent({eventName:'order_completed',sessionId:cleanText(b.sessionId,100),customerId:orderCustomerId,orderId:order.id,orderValue:order.total,metadata:{orderType}});persistState();return res.status(201).json({id:order.id,total:order.total,status:order.status,orderType:order.orderType,tableNumber:order.tableNumber});});
app.post('/api/orders/status',orderStatusRateLimit,(req,res)=>{const orderId=cleanText(req.body?.orderId,20).toUpperCase(),phone=cleanText(req.body?.phone,40),tableNumber=cleanText(req.body?.tableNumber,30);if(!/^O\d{5}$/.test(orderId))return res.status(400).json({message:'Valid order id is required.'});const order=orders.find(item=>item.id===orderId);if(!order)return res.status(404).json({message:'Order not found.'});const authorizedByTable=order.orderType==='dine_in'&&tableNumber&&order.tableNumber===tableNumber;const authorizedByPhone=order.orderType!=='dine_in'&&phone.length>=5&&phone.length<=40&&order.phone===phone;if(!authorizedByTable&&!authorizedByPhone)return res.status(404).json({message:'Order not found.'});return res.json({id:order.id,total:order.total,status:order.status,orderType:order.orderType,tableNumber:order.tableNumber,createdAt:order.createdAt,updatedAt:order.updatedAt,items:Array.isArray(order.items)?order.items.map(item=>({nameAr:item.nameAr,nameEn:item.nameEn,quantity:item.quantity,unitPrice:item.unitPrice,lineTotal:item.lineTotal})):[]});});

app.patch('/api/reservations/:id',requireAdminApiKey,(req,res)=>{const reservation=reservations.find(item=>item.id===req.params.id);if(!reservation)return res.status(404).json({message:'Reservation not found'});if(req.body?.status!==undefined&&!['pending','confirmed','cancelled'].includes(req.body.status))return res.status(400).json({message:'Invalid reservation status'});if(req.body?.status!==undefined)reservation.status=req.body.status;if(req.body?.notes!==undefined)reservation.notes=cleanText(req.body.notes,300);persistState();return res.json(reservation);});

registerMediaRoutes(app,{products,storageReady,presign,requireAdminApiKey});
app.post('/api/videos/presign',requireAdminApiKey,(req,res)=>{if(!storageReady)return res.status(503).json({message:'Video storage is not configured on the web service.'});const productId=cleanText(req.body?.productId,40),fileName=cleanText(req.body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'),contentType=cleanText(req.body?.contentType,80).toLowerCase(),size=Number(req.body?.size);if(!products.some(product=>product.id===productId))return res.status(404).json({message:'Product not found'});if(!fileName||!VIDEO_TYPES.has(contentType))return res.status(400).json({message:'Only MP4, WebM and MOV videos are supported.'});if(!Number.isFinite(size)||size<1||size>MAX_VIDEO_BYTES)return res.status(400).json({message:'Maximum video size is 120 MB.'});const key=`products/${productId}/${crypto.randomUUID()}-${fileName}`;try{return res.json({key,uploadUrl:presign('PUT',key,900),expiresIn:900});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare video upload.'});}});
app.post('/api/videos/delete-presign',requireAdminApiKey,(req,res)=>{if(!storageReady)return res.status(503).json({message:'Video storage is not configured on the web service.'});const productId=cleanText(req.body?.productId,40),product=products.find(item=>item.id===productId);if(!product)return res.status(404).json({message:'Product not found'});if(!product.videoKey)return res.json({url:'',key:''});try{return res.json({url:presign('DELETE',product.videoKey,900),key:product.videoKey});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare video deletion.'});}});

app.get('/api/products',(req,res)=>{const category=cleanText(req.query.category,80),search=cleanText(req.query.search,80).toLowerCase();let result=category?products.filter(product=>product.categoryId===category):products;if(search)result=result.filter(product=>`${product.nameAr} ${product.nameEn}`.toLowerCase().includes(search));if(!isAdminApiKeyValid(req))result=result.filter(product=>product.available!==false);const snapshot=smartSnapshot();return res.json(result.map(product=>withMediaUrls(product,snapshot)));});
app.get('/api/products/:id',(req,res)=>{const product=products.find(item=>item.id===req.params.id);if(!product)return res.status(404).json({message:'Product not found'});if(product.available===false&&!isAdminApiKeyValid(req))return res.status(404).json({message:'Product not found'});return res.json(withMediaUrls(product));});
app.post('/api/products',requireAdminApiKey,(req,res)=>{const {categoryId,nameAr,nameEn,descriptionAr='',descriptionEn='',imageUrl='',imageKey='',price,available=true,videoKey='',tags=[],dietary=[],spiceLevel=0,chefChoice=false,isNew=false}=req.body||{};if(!categoryId||!nameAr||!nameEn||!Number.isFinite(Number(price)))return res.status(400).json({message:'categoryId, nameAr, nameEn and numeric price are required'});if(!categories.some(category=>category.id===categoryId))return res.status(400).json({message:'Unknown category'});const product={id:nextProductId(),categoryId,nameAr:cleanText(nameAr),nameEn:cleanText(nameEn),descriptionAr:cleanText(descriptionAr),descriptionEn:cleanText(descriptionEn),imageUrl:cleanUrl(imageUrl),imageKey:cleanKey(imageKey),price:Number(price),available:Boolean(available),videoKey:cleanKey(videoKey),tags:normalizeList(tags,SMART_TAGS),dietary:normalizeList(dietary,DIETARY_TAGS),spiceLevel:Math.max(0,Math.min(3,Number(spiceLevel)||0)),chefChoice:Boolean(chefChoice),isNew:Boolean(isNew),createdAt:new Date().toISOString(),sortOrder:products.length+1};products.push(product);persistState();return res.status(201).json(withMediaUrls(product));});
app.patch('/api/products/:id',requireAdminApiKey,(req,res)=>{const product=products.find(item=>item.id===req.params.id);if(!product)return res.status(404).json({message:'Product not found'});const b=req.body||{};const oldImageKey=product.imageKey;const oldVideoKey=product.videoKey;if(b.categoryId!==undefined){if(!categories.some(category=>category.id===b.categoryId))return res.status(400).json({message:'Unknown category'});product.categoryId=b.categoryId;}if(b.nameAr!==undefined)product.nameAr=cleanText(b.nameAr);if(b.nameEn!==undefined)product.nameEn=cleanText(b.nameEn);if(b.descriptionAr!==undefined)product.descriptionAr=cleanText(b.descriptionAr);if(b.descriptionEn!==undefined)product.descriptionEn=cleanText(b.descriptionEn);if(b.imageUrl!==undefined){const nextUrl=cleanUrl(b.imageUrl);product.imageUrl=nextUrl;if(nextUrl&&product.imageKey){const oldKey=product.imageKey;product.imageKey='';if(storageReady)void deleteObject(oldKey);}}if(b.imageKey!==undefined)product.imageKey=cleanKey(b.imageKey);if(b.price!==undefined){if(!Number.isFinite(Number(b.price)))return res.status(400).json({message:'Price must be numeric'});product.price=Number(b.price);}if(b.available!==undefined)product.available=Boolean(b.available);if(b.videoKey!==undefined)product.videoKey=cleanKey(b.videoKey);if(b.tags!==undefined)product.tags=normalizeList(b.tags,SMART_TAGS);if(b.dietary!==undefined)product.dietary=normalizeList(b.dietary,DIETARY_TAGS);if(b.spiceLevel!==undefined)product.spiceLevel=Math.max(0,Math.min(3,Number(b.spiceLevel)||0));if(b.chefChoice!==undefined)product.chefChoice=Boolean(b.chefChoice);if(b.isNew!==undefined)product.isNew=Boolean(b.isNew);if(storageReady&&b.imageKey!==undefined&&oldImageKey&&oldImageKey!==product.imageKey)void deleteObject(oldImageKey);if(storageReady&&b.videoKey!==undefined&&oldVideoKey&&oldVideoKey!==product.videoKey)void deleteObject(oldVideoKey);persistState();return res.json(withMediaUrls(product));});
app.delete('/api/products/:id',requireAdminApiKey,(req,res)=>{const index=products.findIndex(product=>product.id===req.params.id);if(index===-1)return res.status(404).json({message:'Product not found'});const [removed]=products.splice(index,1);if(storageReady){if(removed.imageKey)void deleteObject(removed.imageKey);if(removed.videoKey)void deleteObject(removed.videoKey);}persistState();return res.json({ok:true,removed});});

app.get('/cart',(req,res)=>res.sendFile(path.join(__dirname,'cart-page.html')));
app.get('/events',(req,res)=>res.sendFile(path.join(__dirname,'events.html')));
app.get(/^\/events\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'event-page.html')));
app.get('/menu',(req,res)=>res.sendFile(path.join(__dirname,'menu.html')));
app.get(/^\/menu\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'category-page.html')));
app.get(/^\/menu\/[^/]+\/[^/]+$/,(req,res)=>res.sendFile(path.join(__dirname,'product-page.html')));

app.use(express.static(dist));app.use((_req,res)=>res.sendFile(path.join(dist,'index.html')));app.use((error,_req,res,_next)=>{console.error('ARABISK web error:',error);if(!res.headersSent)res.status(500).json({message:'Internal server error'});});
await restoreState();await restoreCategories();await restoreStudio();await restoreExperiences();await revenue.restoreRevenue();if(storageReady)persistState();app.listen(port,()=>console.log(`ARABISK web listening on ${port} — ${products.length} menu items, ${categories.length} categories`));
