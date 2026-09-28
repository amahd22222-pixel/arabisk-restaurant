export function registerCustomerRoutes(app, { service, requireAdminApiKey, profileRateLimit }) {
  app.post('/api/customer-profile', profileRateLimit, async (req, res) => {
    const token = String(req.headers['x-arabisk-profile-token'] || '').trim();
    return res.status(201).json(await service.saveProfile(req.body || {}, token));
  });

  app.get('/api/customer-profile/summary', profileRateLimit, (req, res) => {
    const token = String(req.headers['x-arabisk-profile-token'] || '').trim();
    return res.json(service.profileDashboard(token));
  });

  app.get('/api/customer-profile', profileRateLimit, (req, res) => {
    const token = String(req.headers['x-arabisk-profile-token'] || '').trim();
    return res.json(service.getProfile(token));
  });

  app.get('/api/customers', requireAdminApiKey, (_req, res) => {
    return res.json(service.listCustomers());
  });

  app.patch('/api/customers/:id', requireAdminApiKey, async (req, res) => {
    return res.json(await service.updateCustomer(req.params.id, req.body || {}));
  });
}
