import crypto from 'node:crypto';
import { logServiceFailure } from '../utils/service-error.js';

export function createProductService({
  repository, categories, storageReady, presign, deleteObject, isAdminApiKeyValid,
  cleanText, cleanKey, cleanUrl, normalizeList, smartSnapshot, withMediaUrls,
  invalidateSmartSnapshot, nextProductId, maxVideoBytes, videoTypes
}) {
  const products = repository;
  const smartTags = new Set(['spicy']);
  const dietaryTags = new Set(['vegetarian', 'vegan', 'gluten-free']);
  const presentProduct=(product,snapshot,{includePrivate=false}={})=>{
    const value=withMediaUrls(product,snapshot);
    if(includePrivate)return value;
    const { imageKey: _imageKey, videoKey: _videoKey, ...publicValue } = value;
    return publicValue;
  };

  return {
    list(req, res) {
      const category = cleanText(req.query.category, 80);
      const search = cleanText(req.query.search, 80).toLowerCase();
      let result = category ? products.filter(product => product.categoryId === category) : products.all();
      if (search) result = result.filter(product => `${product.nameAr} ${product.nameEn}`.toLowerCase().includes(search));
      if (!isAdminApiKeyValid(req)) result = result.filter(product => product.available !== false);
      const snapshot = smartSnapshot();
      const admin=isAdminApiKeyValid(req);
      return res.json(result.map(product => presentProduct(product, snapshot, {includePrivate:admin})));
    },

    get(req, res) {
      const product = repository.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (product.available === false && !isAdminApiKeyValid(req)) return res.status(404).json({ message: 'Product not found' });
      return res.json(presentProduct(product, smartSnapshot(), {includePrivate:isAdminApiKeyValid(req)}));
    },

    create(req, res) {
      const { categoryId, nameAr, nameEn, descriptionAr = '', descriptionEn = '', imageUrl = '', imageKey = '', price,
        available = true, videoKey = '', tags = [], dietary = [], spiceLevel = 0, chefChoice = false, isNew = false } = req.body || {};
      const normalizedCategoryId = cleanText(categoryId, 40);
      const normalizedNameAr = cleanText(nameAr, 160);
      const normalizedNameEn = cleanText(nameEn, 160);
      const numericPrice = Number(price);

      if (!normalizedCategoryId || !normalizedNameAr || !normalizedNameEn || !Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ message: 'categoryId, nameAr, nameEn and a valid non-negative price are required' });
      }
      if (!categories.some(category => category.id === normalizedCategoryId)) {
        return res.status(400).json({ message: 'Unknown category' });
      }

      const product = {
        id: nextProductId(), categoryId: normalizedCategoryId, nameAr: normalizedNameAr, nameEn: normalizedNameEn,
        descriptionAr: cleanText(descriptionAr, 1000), descriptionEn: cleanText(descriptionEn, 1000),
        imageUrl: cleanUrl(imageUrl), imageKey: cleanKey(imageKey), price: numericPrice,
        available: Boolean(available), videoKey: cleanKey(videoKey),
        tags: normalizeList(tags, smartTags), dietary: normalizeList(dietary, dietaryTags),
        spiceLevel: Math.max(0, Math.min(3, Number(spiceLevel) || 0)), chefChoice: Boolean(chefChoice),
        isNew: Boolean(isNew), createdAt: new Date().toISOString(), sortOrder: products.all().length + 1
      };
      repository.add(product);
      invalidateSmartSnapshot();
      repository.save();
      return res.status(201).json(withMediaUrls(product));
    },

    update(req, res) {
      const product = repository.findById(req.params.id);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      const body = req.body || {};
      const oldImageKey = product.imageKey;
      const oldVideoKey = product.videoKey;

      if (body.categoryId !== undefined) {
        const categoryId = cleanText(body.categoryId, 40);
        if (!categoryId || !categories.some(category => category.id === categoryId)) {
          return res.status(400).json({ message: 'Unknown category' });
        }
        product.categoryId = categoryId;
      }
      if (body.nameAr !== undefined) {
        const nameAr = cleanText(body.nameAr, 160);
        if (!nameAr) return res.status(400).json({ message: 'Arabic product name is required' });
        product.nameAr = nameAr;
      }
      if (body.nameEn !== undefined) {
        const nameEn = cleanText(body.nameEn, 160);
        if (!nameEn) return res.status(400).json({ message: 'English product name is required' });
        product.nameEn = nameEn;
      }
      if (body.descriptionAr !== undefined) product.descriptionAr = cleanText(body.descriptionAr, 1000);
      if (body.descriptionEn !== undefined) product.descriptionEn = cleanText(body.descriptionEn, 1000);
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
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Price must be a valid non-negative number' });
        product.price = price;
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
      repository.save();
      return res.json(withMediaUrls(product));
    },

    remove(req, res) {
      const removed = repository.removeById(req.params.id);
      if (!removed) return res.status(404).json({ message: 'Product not found' });
      if (storageReady) {
        if (removed.imageKey) void deleteObject(removed.imageKey);
        if (removed.videoKey) void deleteObject(removed.videoKey);
      }
      invalidateSmartSnapshot();
      repository.save();
      return res.json({ ok: true, removed });
    },

    presignVideo(req, res) {
      if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
      const productId = cleanText(req.body?.productId, 40);
      const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
      const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
      const size = Number(req.body?.size);
      if (!repository.findById(productId)) return res.status(404).json({ message: 'Product not found' });
      if (!fileName || !videoTypes.has(contentType)) return res.status(400).json({ message: 'Only MP4, WebM and MOV videos are supported.' });
      if (!Number.isFinite(size) || size < 1 || size > maxVideoBytes) return res.status(400).json({ message: 'Maximum video size is 120 MB.' });
      const key = `products/${productId}/${crypto.randomUUID()}-${fileName}`;
      try {
        return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 });
      } catch (error) {
        logServiceFailure(error,{service:'product',operation:'presignVideo'});
        return res.status(503).json({ message: 'Unable to prepare video upload.' });
      }
    },

    deleteVideoPresign(req, res) {
      if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
      const productId = cleanText(req.body?.productId, 40);
      const product = repository.findById(productId);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      if (!product.videoKey) return res.json({ url: '', key: '' });
      try {
        return res.json({ url: presign('DELETE', product.videoKey, 900), key: product.videoKey });
      } catch (error) {
        logServiceFailure(error,{service:'product',operation:'deleteVideoPresign'});
        return res.status(503).json({ message: 'Unable to prepare video deletion.' });
      }
    }
  };
}
