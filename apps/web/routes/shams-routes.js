export function registerShamsRoutes(app, { service, profileRateLimit }) {
  app.get('/api/shams/status', (_req, res) => {
    return res.json(service.status());
  });

  app.post('/api/shams/chat', profileRateLimit, async (req, res) => {
    const result = await service.chat({
      message: req.body?.message,
      history: req.body?.history,
      profileToken: String(req.headers['x-arabisk-profile-token'] || '').trim(),
      sessionId: String(req.body?.sessionId || '').trim(),
      page: String(req.body?.page || '/').trim(),
      cart: Array.isArray(req.body?.cart) ? req.body.cart : [],
      client: req.body?.client && typeof req.body.client === 'object' ? {
        surface: String(req.body.client.surface || '').trim().slice(0, 30),
        serviceWorkerControlled: Boolean(req.body.client.serviceWorkerControlled)
      } : null
    });
    return res.json(result);
  });
}
