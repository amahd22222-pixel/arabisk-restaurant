import { sendServiceError } from '../utils/service-error.js';
export function registerCustomerRoutes(app, { service, requireAdminApiKey }) {
  app.get('/api/customers', requireAdminApiKey, (_req, res) => {
    return res.json(service.listCustomers());
  });

  app.patch('/api/customers/:id', requireAdminApiKey, (req, res) => {
    try {
      return res.json(service.updateCustomer(req.params.id, req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });
}
