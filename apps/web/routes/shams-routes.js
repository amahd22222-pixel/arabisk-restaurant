export function registerShamsRoutes(app, { service, profileRateLimit }) {
  app.get('/api/shams/status', (_req, res) => {
    return res.json(service.status());
  });

  app.post('/api/shams/chat', profileRateLimit, async (req, res) => {
    const result = await service.chat({
      message: req.body?.message,
      history: req.body?.history,
      profileToken: String(req.headers['x-arabisk-profile-token'] || '').trim()
    });
    return res.json(result);
  });
}
