export function registerReservationRoutes(app, {
  repository, requireAdminApiKey, reservationRateLimit, cleanText, nextReservationId,
  experiences, revenue, crypto
}) {
  const { reservations, customers } = repository;

  app.get('/api/reservations', requireAdminApiKey, (_req, res) => res.json(reservations.all()));

  app.post('/api/reservations', reservationRateLimit, (req, res) => {
    const b = req.body || {};
    const name = cleanText(b.name, 80);
    const phone = cleanText(b.phone, 40);
    const date = cleanText(b.date, 20);
    const time = cleanText(b.time, 10);
    const guests = Number(b.guests);
    const notes = cleanText(b.notes, 300);
    const eventSlug = cleanText(b.eventSlug, 90).toLowerCase();
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const today = new Date().toISOString().slice(0, 10);

    if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) {
      return res.status(400).json({ message: 'name, phone, date, time and guests are required' });
    }
    if (!dateOk || date < today) return res.status(400).json({ message: 'Reservation date must be a valid date that is not in the past.' });
    if (!timeOk) return res.status(400).json({ message: 'Reservation time must be in HH:MM format.' });

    if (eventSlug) {
      const experience = experiences.find(item => item.slug === eventSlug && item.status === 'published');
      if (!experience || experience.bookingEnabled === false) return res.status(400).json({ message: 'Selected experience is not available for booking.' });
      const endTime = Date.parse(experience.endsAt || experience.startsAt || '');
      if (Number.isFinite(endTime) && endTime <= Date.now()) return res.status(400).json({ message: 'Selected experience is no longer accepting bookings.' });
    }

    const duplicate = reservations.findDuplicate(phone, date, time);
    if (duplicate) return res.status(409).json({
      message: 'A reservation already exists for this phone, date and time.',
      reservationId: duplicate.id
    });

    const reservation = {
      id: nextReservationId(),
      name,
      phone,
      date,
      time,
      guests,
      notes,
      eventSlug,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    reservations.add(reservation);

    const reservationCustomer = customers.findByPhone(phone);
    const reservationCustomerId = reservationCustomer?.id || crypto.randomUUID();
    if (reservationCustomer) {
      reservationCustomer.name = name;
      reservationCustomer.reservationCount = Number(reservationCustomer.reservationCount || 0) + 1;
      reservationCustomer.lastReservationAt = reservation.createdAt;
    } else {
      customers.add({
        id: reservationCustomerId,
        name,
        phone,
        orderCount: 0,
        lastOrderAt: '',
        reservationCount: 1,
        lastReservationAt: reservation.createdAt
      });
    }

    revenue.recordEvent({
      eventName: 'reservation_created',
      sessionId: cleanText(b.sessionId, 100),
      customerId: reservationCustomerId,
      reservationId: reservation.id
    });
    reservations.save();
    return res.status(201).json(reservation);
  });

  app.patch('/api/reservations/:id', requireAdminApiKey, (req, res) => {
    const reservation = reservations.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });

    if (req.body?.status !== undefined && !['pending', 'confirmed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid reservation status' });
    }
    if (req.body?.status !== undefined) reservation.status = req.body.status;
    if (req.body?.notes !== undefined) reservation.notes = cleanText(req.body.notes, 300);

    reservations.save();
    return res.json(reservation);
  });
}
