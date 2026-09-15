import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const mediaRoot = process.env.MEDIA_ROOT || '/data/videos';
fs.mkdirSync(mediaRoot, { recursive: true });

const corsOptions = { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] };
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

const categories = [
  ['Breakfast','الفطور','Breakfast'],['Manakish','المناقيش','Manakish'],['Cold Appetizers','المقبلات الباردة','Cold Appetizers'],['Hot Appetizers','المقبلات الساخنة','Hot Appetizers'],['Salads','السلطات','Salads'],['Soups','الشوربات','Soups'],['Sandwich','السندويتش','Sandwich'],['Pizza','البيتزا','Pizza'],['Pasta','الباستا','Pasta'],['Main Course','الأطباق الرئيسية','Main Course'],['Mixed Grill','المشاوي المشكلة','Mixed Grill'],['Mixed Taste','المذاق المشكل','Mixed Taste'],['Desserts','الحلويات','Desserts'],['Cheese Cake','تشيز كيك','Cheese Cake'],['Arabisk Ice Cream','آيس كريم أرابيسك','Arabisk Ice Cream'],['Cocktail & Refreshing Drinks','الكوكتيلات والمشروبات المنعشة','Cocktail & Refreshing Drinks'],['Energy Drinks','مشروبات الطاقة','Energy Drinks'],['Juices','العصائر','Juices'],['Mojitos','الموهيتو','Mojitos'],['Milk Shakes','ميلك شيك','Milk Shakes'],['Tea','الشاي','Tea'],['Coffee','القهوة','Coffee'],['Latte','اللاتيه','Latte'],['Soft Drinks','المشروبات الغازية','Soft Drinks'],['Drinking Water','المياه','Drinking Water'],['Sheesha','الشيشة','Sheesha']
].map(([id,nameAr,nameEn], index) => ({ id, nameAr, nameEn, sortOrder: index + 1, active: true }));

const products = [
  ['Breakfast','فطور أرابيسك','Arabisk Breakfast',94],['Breakfast','فطور الحارة','AL Hara Breakfast',84],['Manakish','مناقيش زعتر','Zaatar Manakish',18],['Manakish','مناقيش جبنة','Cheese Manakish',22],['Cold Appetizers','حمص','Hummus',24],['Cold Appetizers','حمص بيروتي','Hummus BeirutI',26],['Hot Appetizers','بطاطا حارة','Spicy Potato',28],['Hot Appetizers','كبة مقلية','Fried Kibbeh',34],['Salads','تبولة','Tabboulah',34],['Salads','فتوش','Fattoush',34],['Pizza','بيتزا مارغريتا','Pizza Margherita',46],['Pizza','بيتزا بيبروني','Pizza Pepperoni',56],['Pasta','بيني ألفريدو','Penne Alfredo',56],['Pasta','سباجيتي بولونيز','Spaghetti Bolognese',52],['Main Course','كوردون بلو','Cordon Bleu',68],['Mixed Grill','كباب','Kabab',48],['Mixed Grill','شيش طاووق','Shish Tawook',56],['Desserts','كنافة','Kunafa',32],['Desserts','أم علي','UM Ali',34],['Juices','عصير برتقال','Orange Juice',26],['Mojitos','كلاسيك موهيتو','Classic Mojito',32],['Coffee','قهوة تركية','Turkish Coffee',20],['Coffee','كابتشينو','Cappuccino',26],['Tea','شاي أخضر','Green Tea',16],['Sheesha','تفاح ونعناع','Apple With Mint',65]
].map(([categoryId,nameAr,nameEn,price], index) => ({ id: `P${String(index + 1).padStart(3,'0')}`, categoryId, nameAr, nameEn, descriptionAr: '', descriptionEn: '', price, available: true, videoUrl: '', sortOrder: index + 1 }));

const orders = [];
const customers = [];
const reservations = [];
const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanUrl = (value) => { const url = String(value ?? '').trim().slice(0, 1000); if (!url) return ''; try { const parsed = new URL(url); return ['http:','https:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; } };
const nextProductId = () => { const maxId = products.reduce((max, product) => Math.max(max, Number(String(product.id).replace(/^P/, '')) || 0), 0); return `P${String(maxId + 1).padStart(3, '0')}`; };
const nextReservationId = () => `R${String(reservations.length + 1).padStart(4, '0')}`;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
    if (!match) return reject(new Error('Invalid multipart boundary'));
    const boundary = `--${match[1] || match[2]}`;
    const chunks = [];
    let total = 0;
    const limit = 120 * 1024 * 1024;
    req.on('data', (chunk) => { total += chunk.length; if (total > limit) { reject(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' })); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const marker = Buffer.from(boundary);
      const parts = [];
      let start = buffer.indexOf(marker);
      while (start !== -1) {
        const next = buffer.indexOf(marker, start + marker.length);
        if (next === -1) break;
        const part = buffer.subarray(start + marker.length, next);
        if (part.length > 4) parts.push(part.subarray(part.indexOf('\r\n') === 0 ? 2 : 0));
        start = next;
      }
      const fields = {};
      let file = null;
      for (const part of parts) {
        const split = part.indexOf('\r\n\r\n');
        if (split === -1) continue;
        const headers = part.subarray(0, split).toString('utf8');
        let body = part.subarray(split + 4);
        if (body.subarray(-2).toString() === '\r\n') body = body.subarray(0, -2);
        const nameMatch = headers.match(/name="([^"]+)"/i);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        const fileMatch = headers.match(/filename="([^"]*)"/i);
        if (fileMatch && fileMatch[1]) file = { fieldName: name, originalName: fileMatch[1], contentType: (headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream').trim(), buffer: body };
        else fields[name] = body.toString('utf8');
      }
      resolve({ fields, file });
    });
    req.on('error', reject);
  });
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'arabisk-web' }));
app.get('/api/categories', (_req, res) => res.json(categories));
app.get('/api/orders', (_req, res) => res.json(orders));
app.get('/api/customers', (_req, res) => res.json(customers));
app.get('/api/reservations', (_req, res) => res.json(reservations));
app.get('/api/reservations', (_req, res) => res.json(reservations));
app.post('/api/reservations', (req, res) => { const body = req.body || {}; const name = cleanText(body.name,80); const phone = cleanText(body.phone,40); const date = cleanText(body.date,20); const time = cleanText(body.time,10); const guests = Number(body.guests); const notes = cleanText(body.notes,300); if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) return res.status(400).json({ message: 'name, phone, date, time and guests are required' }); const reservation = { id: nextReservationId(), name, phone, date, time, guests, notes, status: 'pending', createdAt: new Date().toISOString() }; reservations.push(reservation); return res.status(201).json(reservation); });
app.patch('/api/reservations/:id', (req, res) => { const reservation = reservations.find((item) => item.id === req.params.id); if (!reservation) return res.status(404).json({ message: 'Reservation not found' }); if (req.body.status !== undefined && !['pending','confirmed','cancelled'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid reservation status' }); if (req.body.status !== undefined) reservation.status = req.body.status; if (req.body.notes !== undefined) reservation.notes = cleanText(req.body.notes,300); return res.json(reservation); });
app.get('/api/products', (req, res) => { const category = cleanText(req.query.category,80); const search = cleanText(req.query.search,80).toLowerCase(); let result = category ? products.filter((p) => p.categoryId === category) : products; if (search) result = result.filter((p) => `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(search)); res.json(result); });
app.get('/api/products/:id', (req, res) => { const product = products.find((p) => p.id === req.params.id); if (!product) return res.status(404).json({ message: 'Product not found' }); return res.json(product); });
app.post('/api/products', (req,res) => { const { categoryId,nameAr,nameEn,descriptionAr='',descriptionEn='',price,available=true,videoUrl='' }=req.body||{}; if(!categoryId||!nameAr||!nameEn||!Number.isFinite(Number(price))) return res.status(400).json({message:'categoryId, nameAr, nameEn and numeric price are required'}); if(!categories.some((c)=>c.id===categoryId)) return res.status(400).json({message:'Unknown category'}); if(videoUrl&&!cleanUrl(videoUrl)) return res.status(400).json({message:'videoUrl must be a valid http(s) URL'}); const product={id:nextProductId(),categoryId,nameAr:cleanText(nameAr),nameEn:cleanText(nameEn),descriptionAr:cleanText(descriptionAr),descriptionEn:cleanText(descriptionEn),price:Number(price),available:Boolean(available),videoUrl:cleanUrl(videoUrl),sortOrder:products.length+1}; products.push(product); return res.status(201).json(product); });
app.patch('/api/products/:id',(req,res)=>{ const product=products.find((p)=>p.id===req.params.id); if(!product) return res.status(404).json({message:'Product not found'}); const body=req.body||{}; if(body.categoryId!==undefined){if(!categories.some((c)=>c.id===body.categoryId)) return res.status(400).json({message:'Unknown category'}); product.categoryId=body.categoryId;} if(body.nameAr!==undefined) product.nameAr=cleanText(body.nameAr); if(body.nameEn!==undefined) product.nameEn=cleanText(body.nameEn); if(body.descriptionAr!==undefined) product.descriptionAr=cleanText(body.descriptionAr); if(body.descriptionEn!==undefined) product.descriptionEn=cleanText(body.descriptionEn); if(body.price!==undefined){if(!Number.isFinite(Number(body.price))) return res.status(400).json({message:'Price must be numeric'}); product.price=Number(body.price);} if(body.available!==undefined) product.available=Boolean(body.available); if(body.videoUrl!==undefined){if(body.videoUrl&&!cleanUrl(body.videoUrl)) return res.status(400).json({message:'videoUrl must be a valid http(s) URL'}); product.videoUrl=cleanUrl(body.videoUrl);} return res.json(product); });

app.post('/api/products/:id/video', async (req,res) => {
  try {
    const product = products.find((p) => p.id === req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const { file } = await parseMultipart(req);
    if (!file) return res.status(400).json({ message: 'video file is required' });
    const allowed = new Set(['video/mp4','video/webm','video/quicktime']);
    if (!allowed.has(file.contentType)) return res.status(415).json({ message: 'Only MP4, WebM or MOV videos are allowed' });
    const ext = file.originalName.toLowerCase().endsWith('.webm') ? '.webm' : file.originalName.toLowerCase().endsWith('.mov') ? '.mov' : '.mp4';
    const fileName = `${product.id}-${crypto.randomUUID()}${ext}`;
    const target = path.join(mediaRoot, fileName);
    await fs.promises.writeFile(target, file.buffer);
    if (product.videoUrl?.startsWith('/media/')) { const old = path.join(mediaRoot, path.basename(product.videoUrl)); fs.promises.unlink(old).catch(() => {}); }
    product.videoUrl = `/media/${fileName}`;
    return res.status(201).json({ ok: true, videoUrl: product.videoUrl, size: file.buffer.length });
  } catch (error) { console.error('video upload error:', error); return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ message: error.message || 'Video upload failed' }); }
});

app.delete('/api/products/:id/video', async (req,res)=>{ const product=products.find((p)=>p.id===req.params.id); if(!product) return res.status(404).json({message:'Product not found'}); if(product.videoUrl?.startsWith('/media/')) { await fs.promises.unlink(path.join(mediaRoot,path.basename(product.videoUrl))).catch(()=>{}); } product.videoUrl=''; return res.json({ok:true}); });

app.use('/media', express.static(mediaRoot, { maxAge: '1d', fallthrough: false }));
app.delete('/api/products/:id', async (req,res)=>{ const index=products.findIndex((p)=>p.id===req.params.id); if(index===-1) return res.status(404).json({message:'Product not found'}); const [removed]=products.splice(index,1); if(removed.videoUrl?.startsWith('/media/')) await fs.promises.unlink(path.join(mediaRoot,path.basename(removed.videoUrl))).catch(()=>{}); return res.json({ok:true,removed}); });
app.use(express.static(dist));
app.use((_req,res)=>res.sendFile(path.join(dist,'index.html')));
app.use((error,_req,res,_next)=>{console.error('ARABISK web error:',error); if(!res.headersSent) res.status(500).json({message:'Internal server error'});});
app.listen(port,()=>console.log(`ARABISK web listening on ${port}`));
