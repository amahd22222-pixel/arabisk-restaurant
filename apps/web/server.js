import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { presign, storageReady } from './storage.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const corsOptions = { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] };
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const categories = [
  ['Breakfast','الفطور','Breakfast'],['Manakish','المناقيش','Manakish'],['Cold Appetizers','المقبلات الباردة','Cold Appetizers'],['Hot Appetizers','المقبلات الساخنة','Hot Appetizers'],['Salads','السلطات','Salads'],['Soups','الشوربات','Soups'],['Sandwich','السندويتش','Sandwich'],['Pizza','البيتزا','Pizza'],['Pasta','الباستا','Pasta'],['Main Course','الأطباق الرئيسية','Main Course'],['Mixed Grill','المشاوي المشكلة','Mixed Grill'],['Mixed Taste','المذاق المشكل','Mixed Taste'],['Desserts','الحلويات','Desserts'],['Cheese Cake','تشيز كيك','Cheese Cake'],['Arabisk Ice Cream','آيس كريم أرابيسك','Arabisk Ice Cream'],['Cocktail & Refreshing Drinks','الكوكتيلات والمشروبات المنعشة','Cocktail & Refreshing Drinks'],['Energy Drinks','مشروبات الطاقة','Energy Drinks'],['Juices','العصائر','Juices'],['Mojitos','الموهيتو','Mojitos'],['Milk Shakes','ميلك شيك','Milk Shakes'],['Tea','الشاي','Tea'],['Coffee','القهوة','Coffee'],['Latte','اللاتيه','Latte'],['Soft Drinks','المشروبات الغازية','Soft Drinks'],['Drinking Water','المياه','Drinking Water'],['Sheesha','الشيشة','Sheesha']
].map(([id,nameAr,nameEn], index) => ({ id, nameAr, nameEn, sortOrder: index + 1, active: true }));

const products = [
  ['Breakfast','فطور أرابيسك','Arabisk Breakfast',94],['Breakfast','فطور الحارة','AL Hara Breakfast',84],['Manakish','مناقيش زعتر','Zaatar Manakish',18],['Manakish','مناقيش جبنة','Cheese Manakish',22],['Cold Appetizers','حمص','Hummus',24],['Cold Appetizers','حمص بيروتي','Hummus BeirutI',26],['Hot Appetizers','بطاطا حارة','Spicy Potato',28],['Hot Appetizers','كبة مقلية','Fried Kibbeh',34],['Salads','تبولة','Tabboulah',34],['Salads','فتوش','Fattoush',34],['Pizza','بيتزا مارغريتا','Pizza Margherita',46],['Pizza','بيتزا بيبروني','Pizza Pepperoni',56],['Pasta','بيني ألفريدو','Penne Alfredo',56],['Pasta','سباجيتي بولونيز','Spaghetti Bolognese',52],['Main Course','كوردون بلو','Cordon Bleu',68],['Mixed Grill','كباب','Kabab',48],['Mixed Grill','شيش طاووق','Shish Tawook',56],['Desserts','كنافة','Kunafa',32],['Desserts','أم علي','UM Ali',34],['Juices','عصير برتقال','Orange Juice',26],['Mojitos','كلاسيك موهيتو','Classic Mojito',32],['Coffee','قهوة تركية','Turkish Coffee',20],['Coffee','كابتشينو','Cappuccino',26],['Tea','شاي أخضر','Green Tea',16],['Sheesha','تفاح ونعناع','Apple With Mint',65]
].map(([categoryId,nameAr,nameEn,price], index) => ({ id: `P${String(index + 1).padStart(3,'0')}`, categoryId, nameAr, nameEn, descriptionAr: '', descriptionEn: '', price, available: true, videoKey: '', sortOrder: index + 1 }));

const orders = [];
const customers = [];
const reservations = [];
const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);
const nextProductId = () => { const maxId = products.reduce((max, product) => Math.max(max, Number(String(product.id).replace(/^P/, '')) || 0), 0); return `P${String(maxId + 1).padStart(3, '0')}`; };
const nextReservationId = () => `R${String(reservations.length + 1).padStart(4, '0')}`;
const withVideoUrl = (product) => ({ ...product, videoUrl: product.videoKey && storageReady ? presign('GET', product.videoKey, 900) : '' });

app.get('/health', (_req, res) => res.json({ ok: true, service: 'arabisk-web', storageReady }));
app.get('/api/categories', (_req, res) => res.json(categories));
app.get('/api/orders', (_req, res) => res.json(orders));
app.get('/api/customers', (_req, res) => res.json(customers));
app.get('/api/reservations', (_req, res) => res.json(reservations));
app.post('/api/reservations', (req, res) => { const body = req.body || {}; const name = cleanText(body.name,80); const phone = cleanText(body.phone,40); const date = cleanText(body.date,20); const time = cleanText(body.time,10); const guests = Number(body.guests); const notes = cleanText(body.notes,300); if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) return res.status(400).json({ message: 'name, phone, date, time and guests are required' }); const reservation = { id: nextReservationId(), name, phone, date, time, guests, notes, status: 'pending', createdAt: new Date().toISOString() }; reservations.push(reservation); return res.status(201).json(reservation); });
app.patch('/api/reservations/:id', (req, res) => { const reservation = reservations.find((item) => item.id === req.params.id); if (!reservation) return res.status(404).json({ message: 'Reservation not found' }); if (req.body.status !== undefined && !['pending','confirmed','cancelled'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid reservation status' }); if (req.body.status !== undefined) reservation.status = req.body.status; if (req.body.notes !== undefined) reservation.notes = cleanText(req.body.notes,300); return res.json(reservation); });

app.post('/api/videos/presign', (req, res) => {
  if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
  const productId = cleanText(req.body?.productId, 40); const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-'); const contentType = cleanText(req.body?.contentType, 80).toLowerCase(); const size = Number(req.body?.size);
  if (!products.some((p) => p.id === productId)) return res.status(404).json({ message: 'Product not found' });
  if (!fileName || !VIDEO_TYPES.has(contentType)) return res.status(400).json({ message: 'Only MP4, WebM and MOV videos are supported.' });
  if (!Number.isFinite(size) || size < 1 || size > MAX_VIDEO_BYTES) return res.status(400).json({ message: 'Maximum video size is 120 MB.' });
  const key = `products/${productId}/${crypto.randomUUID()}-${fileName}`;
  try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); } catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare video upload.' }); }
});

app.get('/api/products', (req, res) => { const category = cleanText(req.query.category,80); const search = cleanText(req.query.search,80).toLowerCase(); let result = category ? products.filter((p) => p.categoryId === category) : products; if (search) result = result.filter((p) => `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(search)); return res.json(result.map(withVideoUrl)); });
app.get('/api/products/:id', (req, res) => { const product = products.find((p) => p.id === req.params.id); if (!product) return res.status(404).json({ message: 'Product not found' }); return res.json(withVideoUrl(product)); });
app.post('/api/products', (req,res) => { const { categoryId,nameAr,nameEn,descriptionAr='',descriptionEn='',price,available=true,videoKey='' }=req.body||{}; if(!categoryId||!nameAr||!nameEn||!Number.isFinite(Number(price))) return res.status(400).json({message:'categoryId, nameAr, nameEn and numeric price are required'}); if(!categories.some((c)=>c.id===categoryId)) return res.status(400).json({message:'Unknown category'}); const product={id:nextProductId(),categoryId,nameAr:cleanText(nameAr),nameEn:cleanText(nameEn),descriptionAr:cleanText(descriptionAr),descriptionEn:cleanText(descriptionEn),price:Number(price),available:Boolean(available),videoKey:cleanKey(videoKey),sortOrder:products.length+1}; products.push(product); return res.status(201).json(withVideoUrl(product)); });
app.patch('/api/products/:id',(req,res)=>{ const product=products.find((p)=>p.id===req.params.id); if(!product) return res.status(404).json({message:'Product not found'}); const body=req.body||{}; if(body.categoryId!==undefined){if(!categories.some((c)=>c.id===body.categoryId)) return res.status(400).json({message:'Unknown category'}); product.categoryId=body.categoryId;} if(body.nameAr!==undefined) product.nameAr=cleanText(body.nameAr); if(body.nameEn!==undefined) product.nameEn=cleanText(body.nameEn); if(body.descriptionAr!==undefined) product.descriptionAr=cleanText(body.descriptionAr); if(body.descriptionEn!==undefined) product.descriptionEn=cleanText(body.descriptionEn); if(body.price!==undefined){if(!Number.isFinite(Number(body.price))) return res.status(400).json({message:'Price must be numeric'}); product.price=Number(body.price);} if(body.available!==undefined) product.available=Boolean(body.available); if(body.videoKey!==undefined) product.videoKey=cleanKey(body.videoKey); return res.json(withVideoUrl(product)); });
app.delete('/api/products/:id',(req,res)=>{ const index=products.findIndex((p)=>p.id===req.params.id); if(index===-1) return res.status(404).json({message:'Product not found'}); const [removed]=products.splice(index,1); return res.json({ok:true,removed}); });
app.use(express.static(dist));
app.use((_req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((error,_req,res,_next)=>{console.error('ARABISK web error:',error); if(!res.headersSent) res.status(500).json({message:'Internal server error'});});
app.listen(port,()=>console.log(`ARABISK web listening on ${port}`));
