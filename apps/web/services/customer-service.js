export function registerCustomerRoutes(app, { repository, requireAdminApiKey, cleanText }) {
  const { customers } = repository;

  app.get('/api/customers', requireAdminApiKey, (_req, res) => res.json(customers.all()));

  app.patch('/api/customers/:id', requireAdminApiKey, (req, res) => {
    const customer = customers.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (req.body?.internalNotes !== undefined) {
      customer.internalNotes = cleanText(req.body.internalNotes, 2000);
      customer.internalNotesUpdatedAt = new Date().toISOString();
    }

    customers.save();
    return res.json({
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      internalNotes: customer.internalNotes || '',
      internalNotesUpdatedAt: customer.internalNotesUpdatedAt || ''
    });
  });
}
