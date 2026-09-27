export function registerPushRoutes(app, { service, pushSubscribeRateLimit, vapidPublicKey }) {
  app.get('/api/push/public-key', (_req, res) => {
    return res.json({ publicKey: vapidPublicKey });
  });

  app.post('/api/push/subscribe', pushSubscribeRateLimit, async (req, res) => {
    const result = await service.saveSubscription(req.body || {});
    return res.status(201).json(result);
  });

  app.post('/api/push/unsubscribe', pushSubscribeRateLimit, async (req, res) => {
    const result = await service.removeSubscription(req.body?.endpoint);
    return res.json(result);
  });
}
