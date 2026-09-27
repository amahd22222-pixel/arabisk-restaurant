const $ = (selector) => document.querySelector(selector);

const translations = {
  ar: {
    reservationEyebrow: 'TABLE RESERVATION',
    reservationTitle: 'احجز طاولتك',
    reservationLead: 'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.',
    nameLabel: 'الاسم', phoneLabel: 'رقم الهاتف', dateLabel: 'التاريخ', timeLabel: 'الوقت', guestsLabel: 'عدد الأشخاص',
    notesLabel: 'ملاحظات', notesPlaceholder: 'مثلاً: طاولة داخلية، مناسبة خاصة…', confirmBooking: 'إرسال طلب الحجز',
    reservationSuccess: 'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.',
    reservationError: 'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.',
    copyright: '© 2026 ARABISK. All rights reserved.'
  },
  en: {
    reservationEyebrow: 'TABLE RESERVATION',
    reservationTitle: 'Book Your Table',
    reservationLead: 'Choose the date, time and number of guests. We will contact you to confirm your reservation.',
    nameLabel: 'Name', phoneLabel: 'Phone Number', dateLabel: 'Date', timeLabel: 'Time', guestsLabel: 'Guests',
    notesLabel: 'Notes', notesPlaceholder: 'For example: indoor table, special occasion…', confirmBooking: 'Send Reservation Request',
    reservationSuccess: 'Your reservation request was received. We will contact you to confirm.',
    reservationError: 'Unable to submit the reservation right now. Please try again.',
    copyright: '© 2026 ARABISK. All rights reserved.'
  }
};

let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

function applyLanguage() {
  const dict = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

  const title = location.pathname.replace(/\/$/,'') === '/reservation'
    ? (language === 'ar' ? 'حجز طاولة — ARABISK' : 'Book a Table — ARABISK')
    : 'ARABISK — Restaurant & Cafe';
  document.title = title;

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    if (dict[key] !== undefined) element.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) element.placeholder = dict[key];
  });

  const toggle = $('#lang-toggle');
  if (toggle) toggle.textContent = language === 'ar' ? 'EN' : 'ع';

  window.dispatchEvent(new CustomEvent('arabisk:language-updated', { detail:{ language } }));
}

function setupHeaderMenu() {
  const button = $('#app-menu-button');
  const nav = $('#app-header-nav');
  if (!button || !nav || button.dataset.bound === '1') return;

  button.dataset.bound = '1';
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'فتح القائمة');
    });
  });

  document.addEventListener('click', event => {
    if (!nav.classList.contains('is-open')) return;
    if (nav.contains(event.target) || button.contains(event.target)) return;
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  });
}

function localToday() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function applyReservationEventContext() {
  const badge = $('#reservation-event');
  if (!badge || location.pathname.replace(/\/$/,'') !== '/reservation') return;

  const slug = new URLSearchParams(location.search).get('event');
  if (!slug) {
    badge.hidden = true;
    return;
  }

  try {
    const response = await fetch('/api/experiences/' + encodeURIComponent(slug), { cache:'no-store' });
    if (!response.ok) throw new Error('Experience lookup failed.');
    const event = await response.json();
    badge.textContent = 'الحجز لهذه التجربة: ' + (event.titleAr || event.titleEn || 'ARABISK Experience');
    badge.hidden = false;

    const notes = $('#reservation-notes');
    if (notes && !notes.value) notes.value = 'حجز فعالية: ' + (event.titleAr || event.titleEn || '');
  } catch {
    badge.hidden = true;
  }
}

function showPage() {
  const reservation = $('#reservation');
  const home = $('#home');
  if (!reservation || !home) return;

  const isReservation = location.pathname.replace(/\/$/,'') === '/reservation';
  home.hidden = isReservation;
  reservation.hidden = !isReservation;
  document.body.classList.toggle('reservation-route', isReservation);

  applyLanguage();
  void applyReservationEventContext();

  if (isReservation) {
    const date = $('#reservation-date');
    if (date) date.min = localToday();
  }
}

async function submitReservation(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const message = $('#reservation-message');
  const button = form.querySelector('button[type="submit"]');
  const date = $('#reservation-date');
  const dict = translations[language];

  if (!message || !button) return;

  message.textContent = '';
  button.disabled = true;

  try {
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        name: $('#reservation-name')?.value || '',
        phone: $('#reservation-phone')?.value || '',
        date: date?.value || '',
        time: $('#reservation-time')?.value || '',
        guests: Number($('#reservation-guests')?.value || 0),
        notes: $('#reservation-notes')?.value || '',
        eventSlug: new URLSearchParams(location.search).get('event') || ''
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || dict.reservationError);
    }

    message.textContent = dict.reservationSuccess;
    form.reset();
    if (date) date.min = localToday();
  } catch (error) {
    console.error('ARABISK reservation error:', error);
    message.textContent = dict.reservationError;
  } finally {
    button.disabled = false;
  }
}

$('#lang-toggle')?.addEventListener('click', () => {
  language = language === 'ar' ? 'en' : 'ar';
  localStorage.setItem('ARABISK_LANG', language);
  applyLanguage();
});

$('#reservation-form')?.addEventListener('submit', submitReservation);
setupHeaderMenu();
showPage();
window.addEventListener('pageshow', showPage);
