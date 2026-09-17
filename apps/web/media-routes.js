import { readJson, writeJson } from './storage.js';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const PRODUCT_DETAILS_STATE_KEY = 'data/arabisk-product-details.json';
const cleanText=(value,max=180)=>String(value??'').trim().slice(0,max);
const listValues=(value,max=8,itemMax=120)=>Array.isArray(value)?[...new Set(value.map(item=>cleanText(item,itemMax)).filter(Boolean))].slice(0,max):[];
const galleryValues=(value)=>listValues(value,8,1000).filter(url=>/^(https?:\/\/|\/)/i.test(url));

export function registerMediaRoutes(app, { products, storageReady, presign, requireAdminApiKey }) {
  const productDetails=[];
  let detailsLoaded=false;
  async function ensureDetails(){
    if(detailsLoaded)return;
    detailsLoaded=true;
    if(!storageReady)return;
    try{
      const saved=await readJson(PRODUCT_DETAILS_STATE_KEY,null);
      if(Array.isArray(saved))productDetails.splice(0,productDetails.length,...saved.filter(item=>item&&item.productId).map(item=>({productId:String(item.productId),portion:cleanText(item.portion,80),ingredientsAr:cleanText(item.ingredientsAr||item.ingredients,1200),allergens:listValues(item.allergens,8,120),notesAr:cleanText(item.notesAr,800),gallery:galleryValues(item.gallery),updatedAt:cleanText(item.updatedAt,40)})));
    }catch(error){console.error('ARABISK product details restore failed:',error)}
  }
  const getDetails=(productId)=>productDetails.find(item=>item.productId===productId);
  const emptyDetails=(productId)=>({productId,portion:'',ingredientsAr:'',allergens:[],notesAr:'',gallery:[]});
  const persistDetails=()=>void writeJson(PRODUCT_DETAILS_STATE_KEY,productDetails);

  app.get('/api/product-details/:id', async (req,res) => {
    const productId=String(req.params.id||'').trim();
    if(!products.some(item=>item.id===productId))return res.status(404).json({message:'Product not found'});
    await ensureDetails();
    const item=getDetails(productId);
    return res.json(item?{...emptyDetails(productId),...item}:emptyDetails(productId));
  });

  app.patch('/api/product-details/:id', requireAdminApiKey, async (req,res) => {
    const productId=String(req.params.id||'').trim();
    if(!products.some(item=>item.id===productId))return res.status(404).json({message:'Product not found'});
    await ensureDetails();
    const b=req.body||{};
    let item=getDetails(productId);
    if(!item){item=emptyDetails(productId);productDetails.push(item)}
    item.portion=cleanText(b.portion,80);
    item.ingredientsAr=cleanText(b.ingredientsAr,1200);
    item.allergens=listValues(b.allergens,8,120);
    item.notesAr=cleanText(b.notesAr,800);
    item.gallery=galleryValues(b.gallery);
    item.updatedAt=new Date().toISOString();
    persistDetails();
    return res.json(item);
  });

  app.post('/api/images/presign', requireAdminApiKey, (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const productId = String(req.body?.productId || '').trim();
    const fileName = String(req.body?.fileName || '').trim().slice(0, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = String(req.body?.contentType || '').trim().toLowerCase();
    const size = Number(req.body?.size);
    const product = products.find((item) => item.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!fileName || !IMAGE_TYPES.has(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WebP and AVIF images are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_IMAGE_BYTES) return res.status(400).json({ message: 'Maximum image size is 15 MB.' });
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = `products/${productId}/images/${requestId}-${fileName}`;
    try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare image upload.' }); }
  });

  app.post('/api/images/delete-presign', requireAdminApiKey, (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const productId = String(req.body?.productId || '').trim();
    const product = products.find((item) => item.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!product.imageKey) return res.json({ url: '', key: '' });
    try { return res.json({ url: presign('DELETE', product.imageKey, 900), key: product.imageKey }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare image deletion.' }); }
  });
}
