import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { presign, storageReady, readJson, writeJson, deleteObject } from './storage.js';
import { categories, products } from './menu-data.js';
import { registerMediaRoutes } from './media-routes.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const STATE_KEY = 'data/arabisk-state.json';
const MENU_VERSION = 2;
const allowedCorsOrigins = new Set([
  'https://arabiskadmin-production.up.railway.app',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
};
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path === '/health' || req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);
const cleanUrl = (value) => String(value ?? '').trim().slice(0, 1000);
const withMediaUrls = (product) => ({
  ...product,
  imageUrl: product.imageKey && storageReady ? presign('GET', product.imageKey, 900) : (product.imageUrl || ''),
  videoUrl: product.videoKey && storageReady ? presign('GET', product.videoKey, 900) : ''
});

const orders = [];
const customers = [];
const reservations = [];

async function restoreState() {
  if (!storageReady) return;
  const saved = await readJson(STATE_KEY, null);
  if (!saved || typeof saved !== 'object') return;
  if (saved.menuVersion === MENU_VERSION && Array.isArray(saved.products) && saved.products.length) products.splice(0, products.length, ...saved.products);
  if (Array.isArray(saved.orders)) orders.splice(0, orders.length, ...saved.orders);
  if (Array.isArray(saved.customers)) customers.splice(0, customers.length, ...saved.customers);
  if (Array.isArray(saved.reservations)) reservations.splice(0, reservations.length, ...saved.reservations);
}

const persistState = () => void writeJson(STATE_KEY, { menuVersion: MENU_VERSION, products, orders, customers, reservations });
const nextProductId = () => { const max = products.reduce((highest, product) => Math.max(highest, Number(String(product.id).replace(/^P/, '')) || 0), 0); return `P${String(max + 1).padStart(3, '0')}`; };
const nextReservationId = () => `R${String(reservations.length + 1).padStart(4, '0')}`;

app.get('/health', (_req, res) => res.json({ ok: true, service: 'arabisk-web', storageReady, persistentStorage: storageReady, menuVersion: MENU_VERSION, productCount: products.length }));
app.get('/api/categories', (_req, res) => res.json(categories));
app.get('/api/orders', (_req, res) => res.json(orders));
app.get('/api/customers', (_req, res) => res.json(customers));
app.get('/api/reservations', (_req, res) => res.json(reservations));

app.post('/api/reservations', (req, res) => {
  const b = req.body || {};
  const name = cleanText(b.name, 80), phone = cleanText(b.phone, 40), date = cleanText(b.date, 20), time = cleanText(b.time, 10), guests = Number(b.guests), notes = cleanText(b.notes, 300);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const today = new Date().toISOString().slice(0, 10);
  if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) return res.status(400).json({ message: 'name, phone, date, time and guests are required' });
  if (!dateOk || date < today) return res.status(400).json({ message: 'Reservation date must be a valid date that is not in the past.' });
  if (!timeOk) return res.status(400).json({ message: 'Reservation time must be in HH:MM format.' });
  const reservation = { id: nextReservationId(), name, phone, date, time, guests, notes, status: 'pending', createdAt: new Date().toISOString() };
  reservations.push(reservation); persistState(); return res.status(201).json(reservation);
});

app.patch('/api/reservations/:id', (req, res) => {
  const reservation = reservations.find((item) => item.id === req.params.id);
  if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
  if (req.body?.status !== undefined && !['pending', 'confirmed', 'cancelled'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid reservation status' });
  if (req.body?.status !== undefined) reservation.status = req.body.status;
  if (req.body?.notes !== undefined) reservation.notes = cleanText(req.body.notes, 300);
  persistState(); return res.json(reservation);
});

registerMediaRoutes(app, { products, storageReady, presign });

app.post('/api/videos/presign', (req, res) => {
  if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
  const productId = cleanText(req.body?.productId, 40), fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-'), contentType = cleanText(req.body?.contentType, 80).toLowerCase(), size = Number(req.body?.size);
  if (!products.some((product) => product.id === productId)) return res.status(404).json({ message: 'Product not found' });
  if (!fileName || !VIDEO_TYPES.has(contentType)) return res.status(400).json({ message: 'Only MP4, WebM and MOV videos are supported.' });
  if (!Number.isFinite(size) || size < 1 || size > MAX_VIDEO_BYTES) return res.status(400).json({ message: 'Maximum video size is 120 MB.' });
  const key = `products/${productId}/${crypto.randomUUID()}-${fileName}`;
  try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); } catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare video upload.' }); }
});

app.post('/api/videos/delete-presign', (req, res) => {
  if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
  const productId = cleanText(req.body?.productId, 40), product = products.find((item) => item.id === productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (!product.videoKey) return res.json({ url: '', key: '' });
  try { return res.json({ url: presign('DELETE', product.videoKey, 900), key: product.videoKey }); } catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare video deletion.' }); }
});

app.get('/api/products', (req, res) => {
  const category = cleanText(req.query.category, 80), search = cleanText(req.query.search, 80).toLowerCase();
  let result = category ? products.filter((product) => product.categoryId === category) : products;
  if (search) result = result.filter((product) => `${product.nameAr} ${product.nameEn}`.toLowerCase().includes(search));
  return res.json(result.map(withMediaUrls));
});
app.get('/api/products/:id', (req, res) => { const product = products.find((item) => item.id === req.params.id); if (!product) return res.status(404).json({ message: 'Product not found' }); return res.json(withMediaUrls(product)); });

app.post('/api/products', (req, res) => {
  const { categoryId, nameAr, nameEn, descriptionAr = '', descriptionEn = '', imageUrl = '', imageKey = '', price, available = true, videoKey = '' } = req.body || {};
  if (!categoryId || !nameAr || !nameEn || !Number.isFinite(Number(price))) return res.status(400).json({ message: 'categoryId, nameAr, nameEn and numeric price are required' });
  if (!categories.some((category) => category.id === categoryId)) return res.status(400).json({ message: 'Unknown category' });
  const product = { id: nextProductId(), categoryId, nameAr: cleanText(nameAr), nameEn: cleanText(nameEn), descriptionAr: cleanText(descriptionAr), descriptionEn: cleanText(descriptionEn), imageUrl: cleanUrl(imageUrl), imageKey: cleanKey(imageKey), price: Number(price), available: Boolean(available), videoKey: cleanKey(videoKey), sortOrder: products.length + 1 };
  products.push(product); persistState(); return res.status(201).json(withMediaUrls(product));
});

app.patch('/api/products/:id', (req, res) => {
  const product = products.find((item) => item.id === req.params.id); if (!product) return res.status(404).json({ message: 'Product not found' });
  const b = req.body || {};
  const oldImageKey = product.imageKey;
  const oldVideoKey = product.videoKey;
  if (b.categoryId !== undefined) { if (!categories.some((category) => category.id === b.categoryId)) return res.status(400).json({ message: 'Unknown category' }); product.categoryId = b.categoryId; }
  if (b.nameAr !== undefined) product.nameAr = cleanText(b.nameAr); if (b.nameEn !== undefined) product.nameEn = cleanText(b.nameEn); if (b.descriptionAr !== undefined) product.descriptionAr = cleanText(b.descriptionAr); if (b.descriptionEn !== undefined) product.descriptionEn = cleanText(b.descriptionEn); if (b.imageUrl !== undefined) product.imageUrl = cleanUrl(b.imageUrl); if (b.imageKey !== undefined) product.imageKey = cleanKey(b.imageKey);
  if (b.price !== undefined) { if (!Number.isFinite(Number(b.price))) return res.status(400).json({ message: 'Price must be numeric' }); product.price = Number(b.price); }
  if (b.available !== undefined) product.available = Boolean(b.available); if (b.videoKey !== undefined) product.videoKey = cleanKey(b.videoKey);
  if (storageReady && b.imageKey !== undefined && oldImageKey && oldImageKey !== product.imageKey) void deleteObject(oldImageKey);
  if (storageReady && b.videoKey !== undefined && oldVideoKey && oldVideoKey !== product.videoKey) void deleteObject(oldVideoKey);
  persistState(); return res.json(withMediaUrls(product));
});

app.delete('/api/products/:id', (req, res) => {
  const index = products.findIndex((product) => product.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Product not found' });
  const [removed] = products.splice(index, 1);
  if (storageReady) { if (removed.imageKey) void deleteObject(removed.imageKey); if (removed.videoKey) void deleteObject(removed.videoKey); }
  persistState(); return res.json({ ok: true, removed });
});

app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.use((error, _req, res, _next) => { console.error('ARABISK web error:', error); if (!res.headersSent) res.status(500).json({ message: 'Internal server error' }); });

await restoreState();
if (storageReady) persistState();
app.listen(port, () => console.log(`ARABISK web listening on ${port} — ${products.length} menu items`));
