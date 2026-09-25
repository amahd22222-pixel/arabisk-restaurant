import { sendServiceError } from '../utils/service-error.js';
export function registerMediaRoutes(app, {
  service,
  requireAdminApiKey
}) {
  app.get('/api/product-details/:id', async (req, res) => {
    try {
      return res.json(await service.getDetailsForProduct(String(req.params.id || '').trim()));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.patch('/api/product-details/:id', requireAdminApiKey, async (req, res) => {
    try {
      return res.json(
        await service.updateDetails(String(req.params.id || '').trim(), req.body || {})
      );
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.post('/api/images/presign', requireAdminApiKey, (req, res) => {
    try {
      return res.json(service.presignImage(req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.post('/api/images/delete-presign', requireAdminApiKey, (req, res) => {
    try {
      return res.json(service.presignImageDelete(req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });
}
