const sendServiceError = (res, error) => {
  const status = Number(error?.status) || 500;
  const payload = { message: error?.message || 'Internal server error' };
  if (error?.meta && typeof error.meta === 'object') Object.assign(payload, error.meta);
  return res.status(status).json(payload);
};

export function registerReservationRoutes(app, { service, requireAdminApiKey, reservationRateLimit }) {
  app.get('/api/reservations', requireAdminApiKey, (_req, res) => {
    return res.json(service.listReservations());
  });

  app.post('/api/reservations', reservationRateLimit, (req, res) => {
    try {
      return res.status(201).json(service.createReservation(req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  app.patch('/api/reservations/:id', requireAdminApiKey, (req, res) => {
    try {
      return res.json(service.updateReservation(req.params.id, req.body || {}));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });
}
