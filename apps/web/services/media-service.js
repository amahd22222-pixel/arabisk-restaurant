import crypto from 'node:crypto';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const PRODUCT_DETAILS_STATE_KEY = 'data/arabisk-product-details.json';

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const listValues = (value, max = 8, itemMax = 120) =>
  Array.isArray(value)
    ? [...new Set(value.map(item => cleanText(item, itemMax)).filter(Boolean))].slice(0, max)
    : [];
const galleryValues = value =>
  listValues(value, 8, 1000).filter(url => /^(https?:\/\/|\/)/i.test(url));

export function createMediaService({
  repository,
  storageReady,
  readJson,
  writeJson,
  presign
}) {
  const { products } = repository;
  const { products } = repository;
  const productDetails = [];
  let detailsLoaded = false;

  async function ensureDetails() {
    if (detailsLoaded) return;
    detailsLoaded = true;
    if (!storageReady) return;

    try {
      const saved = await readJson(PRODUCT_DETAILS_STATE_KEY, null);
      if (Array.isArray(saved)) {
        productDetails.splice(
          0,
          productDetails.length,
          ...saved
            .filter(item => item && item.productId)
            .map(item => ({
              productId: String(item.productId),
              portion: cleanText(item.portion, 80),
              ingredientsAr: cleanText(item.ingredientsAr || item.ingredients, 1200),
              allergens: listValues(item.allergens, 8, 120),
              notesAr: cleanText(item.notesAr, 800),
              gallery: galleryValues(item.gallery),
              updatedAt: cleanText(item.updatedAt, 40)
            }))
        );
      }
    } catch (error) {
      console.error('ARABISK product details restore failed:', error);
    }
  }

  const getDetails = productId =>
    productDetails.find(item => item.productId === productId);

  const emptyDetails = productId => ({
    productId,
    portion: '',
    ingredientsAr: '',
    allergens: [],
    notesAr: '',
    gallery: []
  });

  async function updateDetails(productId, body) {
    await ensureDetails();
    let item = getDetails(productId);
    if (!item) {
      item = emptyDetails(productId);
      productDetails.push(item);
    }

    item.portion = cleanText(body.portion, 80);
    item.ingredientsAr = cleanText(body.ingredientsAr, 1200);
    item.allergens = listValues(body.allergens, 8, 120);
    item.notesAr = cleanText(body.notesAr, 800);
    item.gallery = galleryValues(body.gallery);
    item.updatedAt = new Date().toISOString();

    await writeJson(PRODUCT_DETAILS_STATE_KEY, productDetails);
    return item;
  }

  function assertProduct(productId) {
    const product = products.find(item => item.id === productId);
    if (!product) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }
    return product;
  }

  function presignImage(body) {
    if (!storageReady) {
      const error = new Error('Image storage is not configured on the web service.');
      error.status = 503;
      throw error;
    }

    const productId = String(body?.productId || '').trim();
    const fileName = String(body?.fileName || '')
      .trim()
      .slice(0, 160)
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = String(body?.contentType || '').trim().toLowerCase();
    const size = Number(body?.size);

    assertProduct(productId);

    if (!fileName || !IMAGE_TYPES.has(contentType)) {
      const error = new Error('Only JPG, PNG, WebP and AVIF images are supported.');
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(size) || size < 1 || size > MAX_IMAGE_BYTES) {
      const error = new Error('Maximum image size is 15 MB.');
      error.status = 400;
      throw error;
    }

    const key = `products/${productId}/images/${crypto.randomUUID()}-${fileName}`;
    return {
      key,
      uploadUrl: presign('PUT', key, 900),
      expiresIn: 900
    };
  }

  function presignImageDelete(body) {
    if (!storageReady) {
      const error = new Error('Image storage is not configured on the web service.');
      error.status = 503;
      throw error;
    }

    const productId = String(body?.productId || '').trim();
    const product = assertProduct(productId);

    if (!product.imageKey) return { url: '', key: '' };

    return {
      url: presign('DELETE', product.imageKey, 900),
      key: product.imageKey
    };
  }

  async function getDetailsForProduct(productId) {
    assertProduct(productId);
    await ensureDetails();
    const item = getDetails(productId);
    return item ? { ...emptyDetails(productId), ...item } : emptyDetails(productId);
  }

  return {
    getDetailsForProduct,
    updateDetails,
    presignImage,
    presignImageDelete
  };
}
