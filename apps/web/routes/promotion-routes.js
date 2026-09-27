export function registerPromotionRoutes(app, { service, requireAdminApiKey, claimRateLimit, quoteRateLimit }) {
  app.get('/api/promotions/install', (_req, res) => res.json(service.getPublicInstallOffer()));
  app.get('/api/promotions/today', (_req, res) => res.json(service.getPublicTodayOffer()));

  app.post('/api/promotions/install/claim', claimRateLimit, async (req, res, next) => {
    try {
      return res.status(201).json(await service.claimInstallReward(req.body?.clientId));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/promotions/install/quote', quoteRateLimit, (req, res, next) => {
    try {
      return res.json(service.quoteInstallReward(req.body?.code, req.body?.subtotal));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/promotions/install', requireAdminApiKey, (_req, res) => res.json(service.getAdminInstallOffer()));
  app.patch('/api/admin/promotions/install', requireAdminApiKey, async (req, res, next) => {
    try {
      return res.json(await service.updateInstallOffer(req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/promotions/today', requireAdminApiKey, (_req, res) => res.json(service.getAdminTodayOffer()));
  app.patch('/api/admin/promotions/today', requireAdminApiKey, async (req, res, next) => {
    try {
      return res.json(await service.updateTodayOffer(req.body || {}));
    } catch (error) {
      next(error);
    }
  });
}