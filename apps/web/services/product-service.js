import crypto from 'node:crypto';

export function createProductService({
  products, categories, storageReady, presign, deleteObject, isAdminApiKeyValid,
  cleanText, cleanKey, cleanUrl, normalizeList, smartSnapshot, withMediaUrls,
  persistState, invalidateSmartSnapshot, nextProductId, maxVideoBytes, videoTypes,
  smartPopularWindowMs, smartNewWindowMs
}) {
  const smartTags = new Set(['spicy']);
  const dietaryTags = new Set(['vegetarian', 'vegan', 'gluten-free']);

  return {
    list(req, res) {
      const category = cleanText(req.query.category, 80);
      const search = cleanText(req.query.search, 80).toLowerCase();
      let result = category ? products.filter(product => product.categoryId === category) : products;
      if (search) result = result.filter(product => `${product.nameAr} ${product.nameEn}`.toLowerCase().includes(search));
      if (!isAdminApiKeyValid(req)) result = result.filter(product => product.available !== false);
      const snapshot = smartSnapshot();
      return res.json(result.map(product => withMediaUrls(product, snapshot)));
    },

    get(req, res) {
      const product = products.find(item => item.id === req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (product.available === false && !isAdminApiKeyValid(req)) return res.status(404).json({ message: 'Product not found' });
      return res.json(withMediaUrls(product));
    },

    create(req, res) {
      const { categoryId, nameAr, nameEn, descriptionAr = '', descriptionEn = '', imageUrl = '', imageKey = '', price,
        available = true, videoKey = '', tags = [], dietary = [], spiceLevel = 0, chefChoice = false, isNew = false } = req.body || {};
      if (!categoryId || !nameAr || !nameEn || !Number.isFinite(Number(price))) {
        return res.status(400).json({ message: 'categoryId, nameAr, nameEn and numeric price are required' });
      }
      if (!categories.some(category => category.id === categoryId)) return res.status(400).json({ message: 'Unknown category' });

      const product = {
        id: nextProductId(), categoryId, nameAr: cleanText(nameAr), nameEn: cleanText(nameEn),
        descriptionAr: cleanText(descriptionAr), descriptionEn: cleanText(descriptionEn),
        imageUrl: cleanUrl(imageUrl), imageKey: cleanKey(imageKey), price: Number(price),
        available: Boolean(available), videoKey: cleanKey(videoKey),
        tags: normalizeList(tags, smartTags), dietary: normalizeList(dietary, dietaryTags),
        spiceLevel: Math.max(0, Math.min(3, Number(spiceLevel) || 0)), chefChoice: Boolean(chefChoice),
        isNew: Boolean(isNew), createdAt: new Date().toISOString(), sortOrder: products.length + 1
      };
      products.push(product);
      invalidateSmartSnapshot();
      persistState();
      return res.status(201).json(withMediaUrls(product));
    },

    update(req, res) {
      const product = products.find(item => item.id === req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      const body = req.body || {};
      const oldImageKey = product.imageKey;
      const oldVideoKey = product.videoKey;

      if (body.categoryId !== undefined) {
        if (!categories.some(category => category.id === body.categoryId)) return res.status(400).json({ message: 'Unknown category' });
        product.categoryId = body.categoryId;
      }
      if (body.nameAr !== undefined) product.nameAr = cleanText(body.nameAr);
      if (body.nameEn !== undefined) product.nameEn = cleanText(body.nameEn);
      if (body.descriptionAr !== undefined) product.descriptionAr = cleanText(body.descriptionAr);
      if (body.descriptionEn !== undefined) product.descriptionEn = cleanText(body.descriptionEn);
      if (body.imageUrl !== undefined) {
        const nextUrl = cleanUrl(body.imageUrl);
        product.imageUrl = nextUrl;
        if (nextUrl && product.imageKey) {
          const oldKey = product.imageKey;
          product.imageKey = '';
          if (storageReady) void deleteObject(oldKey);
        }
      }
      if (body.imageKey !== undefined) product.imageKey = cleanKey(body.imageKey);
      if (body.price !== undefined) {
        if (!Number.isFinite(Number(body.price))) return res.status(400).json({ message: 'Price must be numeric' });
        product.price = Number(body.price);
      }
      if (body.available !== undefined) product.available = Boolean(body.available);
      if (body.videoKey !== undefined) product.videoKey = cleanKey(body.videoKey);
      if (body.tags !== undefined) product.tags = normalizeList(body.tags, smartTags);
      if (body.dietary !== undefined) product.dietary = normalizeList(body.dietary, dietaryTags);
      if (body.spiceLevel !== undefined) product.spiceLevel = Math.max(0, Math.min(3, Number(body.spiceLevel) || 0));
      if (body.chefChoice !== undefined) product.chefChoice = Boolean(body.chefChoice);
      if (body.isNew !== undefined) product.isNew = Boolean(body.isNew);
      if (storageReady && body.imageKey !== undefined && oldImageKey && oldImageKey !== product.imageKey) void deleteObject(oldImageKey);
      if (storageReady && body.videoKey !== undefined && oldVideoKey && oldVideoKey !== product.videoKey) void deleteObject(oldVideoKey);
      invalidateSmartSnapshot();
      persistState();
      return res.json(withMediaUrls(product));
    },

    remove(req, res) {
      const index = products.findIndex(product => product.id === req.params.id);
      if (index === -1) return res.status(404).json({ message: 'Product not found' });
      const [removed] = products.splice(index, 1);
      if (storageReady) {
        if (removed.imageKey) void deleteObject(removed.imageKey);
        if (removed.videoKey) void deleteObject(removed.videoKey);
      }
      invalidateSmartSnapshot();
      persistState();
      return res.json({ ok: true, removed });
    },

    presignVideo(req, res) {
      if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
      const productId = cleanText(req.body?.productId, 40);
      const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
      const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
      const size = Number(req.body?.size);
      if (!products.some(product => product.id === productId)) return res.status(404).json({ message: 'Product not found' });
      if (!fileName || !videoTypes.has(contentType)) return res.status(400).json({ message: 'Only MP4, WebM and MOV videos are supported.' });
      if (!Number.isFinite(size) || size < 1 || size > maxVideoBytes) return res.status(400).json({ message: 'Maximum video size is 120 MB.' });
      const key = `products/${productId}/${crypto.randomUUID()}-${fileName}`;
      try {
        return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 });
      } catch (error) {
        console.error(error);
        return res.status(503).json({ message: 'Unable to prepare video upload.' });
      }
    },

    deleteVideoPresign(req, res) {
      if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
      const productId = cleanText(req.body?.productId, 40);
      const product = products.find(item => item.id === productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (!product.videoKey) return res.json({ url: '', key: '' });
      try {
        return res.json({ url: presign('DELETE', product.videoKey, 900), key: product.videoKey });
      } catch (error) {
        console.error(error);
        return res.status(503).json({ message: 'Unable to prepare video deletion.' });
      }
    }
  };
}
