export function registerNotificationRoutes(app, {
  service,
  requireAdminApiKey,
  sendRateLimit
}) {
  app.get('/api/notifications', requireAdminApiKey, (_req, res) => {
    return res.json({
      status: service.getStatus(),
      campaigns: service.list()
    });
  });

  app.post('/api/notifications/send', requireAdminApiKey, sendRateLimit, async (req, res) => {
    const campaign = await service.createAndSend(req.body || {}, { scheduleAt: '' });
    return res.status(201).json(campaign);
  });

  app.post('/api/notifications/schedule', requireAdminApiKey, sendRateLimit, async (req, res) => {
    const campaign = await service.createAndSend(req.body || {}, { scheduleAt: req.body?.scheduleAt });
    return res.status(201).json(campaign);
  });

  app.post('/api/notifications/:id/cancel', requireAdminApiKey, sendRateLimit, async (req, res) => {
    const campaign = await service.cancel(req.params.id);
    return res.json(campaign);
  });
}
