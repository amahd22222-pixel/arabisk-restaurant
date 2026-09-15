import crypto from 'node:crypto';

const CATEGORY_STATE_KEY = 'data/arabisk-categories.json';
const MAX_CATEGORY_IMAGE_BYTES = 15 * 1024 * 1024;
const CATEGORY_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);
const cleanUrl = (value) => String(value ?? '').trim().slice(0, 1000);
const withImageUrl = (category, storageReady, presign) => ({
  ...category,
  imageUrl: category.imageKey && storageReady ? presign('GET', category.imageKey, 900) : (category.imageUrl || '')
});

export function registerCategoryRoutes(app, { categories, products, storageReady, presign, readJson, writeJson, deleteObject }) {
  async function restoreCategories() {
    if (!storageReady) return;
    const saved = await readJson(CATEGORY_STATE_KEY, null);
    if (!Array.isArray(saved) || !saved.length) return;
    categories.splice(0, categories.length, ...saved);
  }

  const persistCategories = () => void writeJson(CATEGORY_STATE_KEY, categories);
  const nextCategoryId = () => {
    const max = categories.reduce((highest, category) => {
      const match = String(category.id || '').match(/^C(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `C${String(max + 1).padStart(3, '0')}`;
  };

  app.get('/api/categories', (_req, res) => res.json(categories.map((category) => withImageUrl(category, storageReady, presign))));

  app.post('/api/categories', (req, res) => {
    const b = req.body || {};
    const nameAr = cleanText(b.nameAr, 100);
    const nameEn = cleanText(b.nameEn, 120);
    const imageUrl = cleanUrl(b.imageUrl);
    const imageKey = cleanKey(b.imageKey);
    const active = b.active !== undefined ? Boolean(b.active) : true;
    if (!nameAr || !nameEn) return res.status(400).json({ message: 'nameAr and nameEn are required' });
    const duplicate = categories.some((category) => category.nameAr === nameAr || category.nameEn.toLowerCase() === nameEn.toLowerCase());
    if (duplicate) return res.status(409).json({ message: 'Category with the same name already exists' });
    const category = { id: nextCategoryId(), nameAr, nameEn, imageUrl, imageKey, sortOrder: categories.length + 1, active };
    categories.push(category);
    persistCategories();
    return res.status(201).json(withImageUrl(category, storageReady, presign));
  });

  app.patch('/api/categories/:id', (req, res) => {
    const category = categories.find((item) => item.id === req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const b = req.body || {};
    const oldImageKey = category.imageKey || '';
    if (b.nameAr !== undefined) {
      const value = cleanText(b.nameAr, 100);
      if (!value) return res.status(400).json({ message: 'Arabic category name cannot be empty' });
      category.nameAr = value;
    }
    if (b.nameEn !== undefined) {
      const value = cleanText(b.nameEn, 120);
      if (!value) return res.status(400).json({ message: 'English category name cannot be empty' });
      category.nameEn = value;
    }
    if (b.active !== undefined) category.active = Boolean(b.active);
    if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) category.sortOrder = Math.max(1, Number(b.sortOrder));
    if (b.imageUrl !== undefined) category.imageUrl = cleanUrl(b.imageUrl);
    if (b.imageKey !== undefined) category.imageKey = cleanKey(b.imageKey);
    const duplicate = categories.some((item) => item.id !== category.id && (item.nameAr === category.nameAr || item.nameEn.toLowerCase() === category.nameEn.toLowerCase()));
    if (duplicate) return res.status(409).json({ message: 'Category with the same name already exists' });
    if (storageReady && b.imageKey !== undefined && oldImageKey && oldImageKey !== category.imageKey) void deleteObject(oldImageKey);
    persistCategories();
    return res.json(withImageUrl(category, storageReady, presign));
  });

  app.delete('/api/categories/:id', (req, res) => {
    const index = categories.findIndex((category) => category.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'Category not found' });
    const category = categories[index];
    const linkedProducts = products.filter((product) => product.categoryId === category.id).length;
    if (linkedProducts > 0) {
      return res.status(409).json({ message: `لا يمكن حذف القسم لأنه يحتوي على ${linkedProducts} صنف. انقل الأصناف إلى قسم آخر أولاً.` });
    }
    categories.splice(index, 1);
    if (storageReady && category.imageKey) void deleteObject(category.imageKey);
    categories.forEach((item, itemIndex) => { item.sortOrder = itemIndex + 1; });
    persistCategories();
    return res.json({ ok: true, removed: category });
  });

  app.post('/api/categories/images/presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const categoryId = cleanText(req.body?.categoryId, 40);
    const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
    const size = Number(req.body?.size);
    if (categoryId && !categories.some((category) => category.id === categoryId)) return res.status(404).json({ message: 'Category not found' });
    if (!fileName || !CATEGORY_IMAGE_TYPES.has(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WebP and AVIF images are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_CATEGORY_IMAGE_BYTES) return res.status(400).json({ message: 'Maximum category image size is 15 MB.' });
    const targetId = categoryId || `new-${crypto.randomUUID()}`;
    const key = `categories/${targetId}/${crypto.randomUUID()}-${fileName}`;
    try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare category image upload.' }); }
  });

  app.post('/api/categories/images/delete-presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const categoryId = cleanText(req.body?.categoryId, 40);
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (!category.imageKey) return res.json({ url: '', key: '' });
    try { return res.json({ url: presign('DELETE', category.imageKey, 900), key: category.imageKey }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare category image deletion.' }); }
  });

  return restoreCategories;
}
