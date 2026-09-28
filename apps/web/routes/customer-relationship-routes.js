export function registerCustomerRelationshipRoutes(app, { service, requireAdminApiKey, rateLimit, findCustomerByProfileToken }) {
  app.get('/api/customer-experience', rateLimit, (req, res) => {
    const token = String(req.headers['x-arabisk-profile-token'] || '').trim();
    const customer = findCustomerByProfileToken?.(token);
    if (!customer?.id) return res.status(401).json({ message: 'Customer profile required.' });
    const result = service.appExperienceContext(customer.id);
    if (!result) return res.status(404).json({ message: 'Customer not found.' });
    return res.json(result);
  });

  app.get('/api/customers/relationship-summary', requireAdminApiKey, rateLimit, (_req, res) => {
    return res.json(service.summary());
  });

  app.get('/api/customers/:id/relationship', requireAdminApiKey, rateLimit, (req, res) => {
    const result = service.customerRelationship(req.params.id);
    if (!result) return res.status(404).json({ message: 'Customer not found.' });
    return res.json(result);
  });
}
