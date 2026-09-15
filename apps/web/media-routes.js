const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export function registerMediaRoutes(app, { products, storageReady, presign }) {
  app.post('/api/images/presign', (req, res) => {
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

  app.post('/api/images/delete-presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Image storage is not configured on the web service.' });
    const productId = String(req.body?.productId || '').trim();
    const product = products.find((item) => item.id === productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!product.imageKey) return res.json({ url: '', key: '' });
    try { return res.json({ url: presign('DELETE', product.imageKey, 900), key: product.imageKey }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare image deletion.' }); }
  });
}
