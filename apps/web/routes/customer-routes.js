export function registerCustomerRoutes(app, { service, requireAdminApiKey }) {
  app.get('/api/customers', requireAdminApiKey, (_req, res) => {
    return res.json(service.listCustomers());
  });

  app.patch('/api/customers/:id', requireAdminApiKey, async (req, res) => {
    return res.json(await service.updateCustomer(req.params.id, req.body || {}));
  });
}
