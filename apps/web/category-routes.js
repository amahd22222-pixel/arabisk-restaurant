import crypto from 'node:crypto';

const CATEGORY_STATE_KEY = 'data/arabisk-categories.json';
const BANNER_STATE_KEY = 'data/arabisk-banners.json';
const MAX_CATEGORY_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_BANNER_IMAGE_BYTES = 15 * 1024 * 1024;
const CATEGORY_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const BANNER_IMAGE_TYPES = CATEGORY_IMAGE_TYPES;

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);
const cleanUrl = (value) => String(value ?? '').trim().slice(0, 1000);
const withImageUrl = (category, storageReady, presign) => ({
  ...category,
  imageUrl: category.imageKey && storageReady ? presign('GET', category.imageKey, 900) : (category.imageUrl || '')
});
const withBannerUrls = (banner, storageReady, presign) => ({
  ...banner,
  imageUrl: banner.imageKey && storageReady ? presign('GET', banner.imageKey, 900) : (banner.imageUrl || ''),
  mobileImageUrl: banner.mobileImageKey && storageReady ? presign('GET', banner.mobileImageKey, 900) : (banner.mobileImageUrl || '')
});
const normalizePlacement = (value) => {
  const placement = cleanText(value, 40).toLowerCase();
  return ['home-hero', 'home-promo', 'menu-top', 'footer-promo', 'custom'].includes(placement) ? placement : 'custom';
};
const defaultBanners = () => [{
  id: 'B001',
  placement: 'home-hero',
  titleAr: 'مذاق عربي',
  titleEn: 'Authentic Arabic Taste',
  subtitleAr: 'تجربة ضيافة عربية بطابع عصري.',
  subtitleEn: 'A modern Arabic hospitality experience.',
  buttonTextAr: 'استكشف المنيو',
  buttonTextEn: 'Explore Menu',
  link: '#menu',
  imageUrl: '',
  imageKey: '',
  mobileImageUrl: '',
  mobileImageKey: '',
  active: true,
  sortOrder: 1
}];

export function registerCategoryRoutes(app, { categories, products, storageReady, presign, readJson, writeJson, deleteObject }) {
  async function restoreCategories() {
    if (!storageReady) return;
    const saved = await readJson(CATEGORY_STATE_KEY, null);
    if (!Array.isArray(saved) || !saved.length) return;
    categories.splice(0, categories.length, ...saved);
  }

  async function restoreBanners() {
    if (!storageReady) return;
    const saved = await readJson(BANNER_STATE_KEY, null);
    if (!Array.isArray(saved)) return;
    banners.splice(0, banners.length, ...saved);
  }

  const persistCategories = () => void writeJson(CATEGORY_STATE_KEY, categories);
  const persistBanners = () => void writeJson(BANNER_STATE_KEY, banners);
  const nextCategoryId = () => {
    const max = categories.reduce((highest, category) => {
      const match = String(category.id || '').match(/^C(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `C${String(max + 1).padStart(3, '0')}`;
  };
  const nextBannerId = () => {
    const max = banners.reduce((highest, banner) => {
      const match = String(banner.id || '').match(/^B(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `B${String(max + 1).padStart(3, '0')}`;
  };

  const banners = defaultBanners();

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

  app.get('/api/banners', (req, res) => {
    const placement = req.query?.placement ? normalizePlacement(req.query.placement) : '';
    const items = banners
      .filter((banner) => !placement || banner.placement === placement)
      .slice()
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    return res.json(items.map((banner) => withBannerUrls(banner, storageReady, presign)));
  });

  app.post('/api/banners', (req, res) => {
    const b = req.body || {};
    const titleAr = cleanText(b.titleAr, 140);
    const titleEn = cleanText(b.titleEn, 160);
    if (!titleAr && !titleEn) return res.status(400).json({ message: 'titleAr or titleEn is required' });
    const banner = {
      id: nextBannerId(),
      placement: normalizePlacement(b.placement),
      titleAr,
      titleEn,
      subtitleAr: cleanText(b.subtitleAr, 260),
      subtitleEn: cleanText(b.subtitleEn, 300),
      buttonTextAr: cleanText(b.buttonTextAr, 80),
      buttonTextEn: cleanText(b.buttonTextEn, 90),
      link: cleanUrl(b.link || '#menu'),
      imageUrl: cleanUrl(b.imageUrl),
      imageKey: cleanKey(b.imageKey),
      mobileImageUrl: cleanUrl(b.mobileImageUrl),
      mobileImageKey: cleanKey(b.mobileImageKey),
      active: b.active !== undefined ? Boolean(b.active) : true,
      sortOrder: Number.isFinite(Number(b.sortOrder)) ? Math.max(1, Number(b.sortOrder)) : banners.length + 1
    };
    banners.push(banner);
    persistBanners();
    return res.status(201).json(withBannerUrls(banner, storageReady, presign));
  });

  app.patch('/api/banners/:id', (req, res) => {
    const banner = banners.find((item) => item.id === req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    const b = req.body || {};
    const oldImageKey = banner.imageKey || '';
    const oldMobileImageKey = banner.mobileImageKey || '';
    const textFields = ['titleAr','titleEn','subtitleAr','subtitleEn','buttonTextAr','buttonTextEn'];
    textFields.forEach((field) => { if (b[field] !== undefined) banner[field] = cleanText(b[field], field.toLowerCase().includes('title') ? 160 : 300); });
    if (b.placement !== undefined) banner.placement = normalizePlacement(b.placement);
    if (b.link !== undefined) banner.link = cleanUrl(b.link);
    if (b.imageUrl !== undefined) banner.imageUrl = cleanUrl(b.imageUrl);
    if (b.imageKey !== undefined) banner.imageKey = cleanKey(b.imageKey);
    if (b.mobileImageUrl !== undefined) banner.mobileImageUrl = cleanUrl(b.mobileImageUrl);
    if (b.mobileImageKey !== undefined) banner.mobileImageKey = cleanKey(b.mobileImageKey);
    if (b.active !== undefined) banner.active = Boolean(b.active);
    if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) banner.sortOrder = Math.max(1, Number(b.sortOrder));
    if (!banner.titleAr && !banner.titleEn) return res.status(400).json({ message: 'titleAr or titleEn is required' });
    if (storageReady && b.imageKey !== undefined && oldImageKey && oldImageKey !== banner.imageKey) void deleteObject(oldImageKey);
    if (storageReady && b.mobileImageKey !== undefined && oldMobileImageKey && oldMobileImageKey !== banner.mobileImageKey) void deleteObject(oldMobileImageKey);
    persistBanners();
    return res.json(withBannerUrls(banner, storageReady, presign));
  });

  app.delete('/api/banners/:id', (req, res) => {
    const index = banners.findIndex((banner) => banner.id === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'Banner not found' });
    const [banner] = banners.splice(index, 1);
    if (storageReady && banner.imageKey) void deleteObject(banner.imageKey);
    if (storageReady && banner.mobileImageKey) void deleteObject(banner.mobileImageKey);
    banners.forEach((item, itemIndex) => { item.sortOrder = itemIndex + 1; });
    persistBanners();
    return res.json({ ok: true, removed: banner });
  });

  app.post('/api/banners/images/presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const bannerId = cleanText(req.body?.bannerId, 40);
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
    const size = Number(req.body?.size);
    if (!fileName || !BANNER_IMAGE_TYPES.has(contentType)) return res.status(400).json({ message: 'Only JPG, PNG, WebP and AVIF images are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_BANNER_IMAGE_BYTES) return res.status(400).json({ message: 'Maximum banner image size is 15 MB.' });
    if (bannerId && !banners.some((banner) => banner.id === bannerId)) return res.status(404).json({ message: 'Banner not found' });
    const targetId = bannerId || `new-${crypto.randomUUID()}`;
    const key = `banners/${targetId}/${slot}/${crypto.randomUUID()}-${fileName}`;
    try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare banner image upload.' }); }
  });

  app.post('/api/banners/images/delete-presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const bannerId = cleanText(req.body?.bannerId, 40);
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const banner = banners.find((item) => item.id === bannerId);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    const key = slot === 'mobile' ? banner.mobileImageKey : banner.imageKey;
    if (!key) return res.json({ url: '', key: '' });
    try { return res.json({ url: presign('DELETE', key, 900), key }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare banner image deletion.' }); }
  });

  return async () => {
    await restoreCategories();
    await restoreBanners();
  };
}
