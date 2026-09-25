export function registerOrderRoutes(app, { service, requireAdminApiKey, orderRateLimit, orderStatusRateLimit }) {
  app.get('/api/orders', requireAdminApiKey, (_req, res) => {
    return res.json(service.listOrders());
  });

  app.patch('/api/orders/:id', requireAdminApiKey, async (req, res) => {
    return res.json(await service.updateOrder(req.params.id, req.body || {}));
  });

  app.post('/api/orders', orderRateLimit, async (req, res) => {
    const order = await service.createOrder(req.body || {});
    return res.status(201).json({
      id: order.id,
      total: order.total,
      status: order.status,
      orderType: order.orderType,
      tableNumber: order.tableNumber
    });
  });

  app.post('/api/orders/status', orderStatusRateLimit, (req, res) => {
    return res.json(service.getPublicStatus(req.body || {}));
  });
}
