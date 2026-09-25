export function registerReservationRoutes(app, { service, requireAdminApiKey, reservationRateLimit }) {
  app.get('/api/reservations', requireAdminApiKey, (_req, res) => {
    return res.json(service.listReservations());
  });

  app.post('/api/reservations', reservationRateLimit, async (req, res) => {
    return res.status(201).json(await service.createReservation(req.body || {}));
  });

  app.patch('/api/reservations/:id', requireAdminApiKey, async (req, res) => {
    return res.json(await service.updateReservation(req.params.id, req.body || {}));
  });
}
