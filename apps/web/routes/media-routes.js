const sendServiceError = (res, error) => {
  const status = Number(error?.status) || 500;
  return res.status(status).json({ message: error?.message || 'Internal server error' });
};

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
