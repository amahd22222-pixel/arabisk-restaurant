export function registerMediaRoutes(app, {
  service,
  requireAdminApiKey
}) {
  app.get('/api/product-details/:id', async (req, res) => {
    return res.json(await service.getDetailsForProduct(String(req.params.id || '').trim()));
  });

  app.patch('/api/product-details/:id', requireAdminApiKey, async (req, res) => {
    return res.json(
      await service.updateDetails(String(req.params.id || '').trim(), req.body || {})
    );
  });

  app.post('/api/images/presign', requireAdminApiKey, (req, res) => {
    return res.json(service.presignImage(req.body || {}));
  });

  app.post('/api/images/delete-presign', requireAdminApiKey, (req, res) => {
    return res.json(service.presignImageDelete(req.body || {}));
  });
}
