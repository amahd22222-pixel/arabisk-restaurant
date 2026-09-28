export function registerCustomerRelationshipRoutes(app, { service, requireAdminApiKey, rateLimit }) {
  app.get('/api/customers/relationship-summary', requireAdminApiKey, rateLimit, (_req, res) => {
    return res.json(service.summary());
  });

  app.get('/api/customers/:id/relationship', requireAdminApiKey, rateLimit, (req, res) => {
    const result = service.customerRelationship(req.params.id);
    if (!result) return res.status(404).json({ message: 'Customer not found.' });
    return res.json(result);
  });
}
