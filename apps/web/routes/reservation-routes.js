export function registerReservationRoutes(app, { service, requireAdminApiKey, reservationRateLimit }) {
  app.get('/api/reservations', requireAdminApiKey, (_req, res) => {
    return res.json(service.listReservations());
  });

  app.post('/api/reservations', reservationRateLimit, (req, res) => {
    return res.status(201).json(service.createReservation(req.body || {}));
  });

  app.patch('/api/reservations/:id', requireAdminApiKey, (req, res) => {
    return res.json(service.updateReservation(req.params.id, req.body || {}));
  });
}
