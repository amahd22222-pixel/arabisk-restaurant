const sendServiceError = (res, error) => {
  const status = Number(error?.status) || 500;
  return res.status(status).json({ message: error?.message || 'Internal server error' });
};

export function registerOrderRoutes(app, { service, requireAdminApiKey, orderRateLimit, orderStatusRateLimit }) {
  app.get('/api/orders', requireAdminApiKey, (_req, res) => {
    return res.json(service.listOrders());
  });

  app.patch('/api/orders/:id', requireAdminApiKey, (req, res) => {
    try {
      return res.json(service.updateOrder(req.params.id, req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.post('/api/orders', orderRateLimit, (req, res) => {
    try {
      const order = service.createOrder(req.body || {});
      return res.status(201).json({
        id: order.id,
        total: order.total,
        status: order.status,
        orderType: order.orderType,
        tableNumber: order.tableNumber
      });
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.post('/api/orders/status', orderStatusRateLimit, (req, res) => {
    try {
      return res.json(service.getPublicStatus(req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });
}