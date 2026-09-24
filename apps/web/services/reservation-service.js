const RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'cancelled']);

class ReservationServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReservationServiceError';
    this.status = status;
  }
}

export function createReservationService({ repository, cleanText, nextReservationId, experiences, revenue, crypto }) {
  const { reservations, customers } = repository;

  function listReservations() {
    return reservations.all();
  }

  function createReservation(body) {
    const name = cleanText(body.name, 80);
    const phone = cleanText(body.phone, 40);
    const date = cleanText(body.date, 20);
    const time = cleanText(body.time, 10);
    const guests = Number(body.guests);
    const notes = cleanText(body.notes, 300);
    const eventSlug = cleanText(body.eventSlug, 90).toLowerCase();
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    const today = new Date().toISOString().slice(0, 10);

    if (!name || !phone || !date || !time || !Number.isInteger(guests) || guests < 1 || guests > 20) {
      throw new ReservationServiceError('name, phone, date, time and guests are required');
    }
    if (!dateOk || date < today) {
      throw new ReservationServiceError('Reservation date must be a valid date that is not in the past.');
    }
    if (!timeOk) {
      throw new ReservationServiceError('Reservation time must be in HH:MM format.');
    }

    if (eventSlug) {
      const experience = experiences.find(item => item.slug === eventSlug && item.status === 'published');
      if (!experience || experience.bookingEnabled === false) {
        throw new ReservationServiceError('Selected experience is not available for booking.');
      }
      const endTime = Date.parse(experience.endsAt || experience.startsAt || '');
      if (Number.isFinite(endTime) && endTime <= Date.now()) {
        throw new ReservationServiceError('Selected experience is no longer accepting bookings.');
      }
    }

    const duplicate = reservations.findDuplicate(phone, date, time);
    if (duplicate) {
      const error = new ReservationServiceError('A reservation already exists for this phone, date and time.', 409);
      error.meta = { reservationId: duplicate.id };
      throw error;
    }

    const createdAt = new Date().toISOString();
    const reservation = {
      id: nextReservationId(),
      name, phone, date, time, guests, notes, eventSlug,
      status: 'pending',
      createdAt
    };
    reservations.add(reservation);

    const reservationCustomer = customers.findByPhone(phone);
    const reservationCustomerId = reservationCustomer?.id || crypto.randomUUID();

    if (reservationCustomer) {
      reservationCustomer.name = name;
      reservationCustomer.reservationCount = Number(reservationCustomer.reservationCount || 0) + 1;
      reservationCustomer.lastReservationAt = createdAt;
    } else {
      customers.add({
        id: reservationCustomerId,
        name, phone, orderCount: 0, lastOrderAt: '',
        reservationCount: 1,
        lastReservationAt: createdAt
      });
    }

    revenue.recordEvent({
      eventName: 'reservation_created',
      sessionId: cleanText(body.sessionId, 100),
      customerId: reservationCustomerId,
      reservationId: reservation.id
    });

    reservations.save();
    return reservation;
  }

  function updateReservation(id, body) {
    const reservation = reservations.findById(id);
    if (!reservation) throw new ReservationServiceError('Reservation not found', 404);

    if (body?.status !== undefined) {
      const nextStatus = String(body.status);
      if (!RESERVATION_STATUSES.has(nextStatus)) {
        throw new ReservationServiceError('Invalid reservation status');
      }
      reservation.status = nextStatus;
    }

    if (body?.notes !== undefined) reservation.notes = cleanText(body.notes, 300);
    reservations.save();
    return reservation;
  }

  return { listReservations, createReservation, updateReservation };
}
