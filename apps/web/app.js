const $ = (selector) => document.querySelector(selector);

const translations = {
  ar: {
    home: 'الرئيسية', menu: 'استكشف المنيو', events: 'الفعاليات', reservationNav: 'حجز طاولة', about: 'عن المطعم', contact: 'تواصل معنا',
    exploreMenu: 'استكشف المنيو', reserveHome: 'احجز طاولتك',
    reservationEyebrow: 'TABLE RESERVATION', reservationTitle: 'احجز طاولتك',
    reservationLead: 'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.',
    nameLabel: 'الاسم', phoneLabel: 'رقم الهاتف', dateLabel: 'التاريخ', timeLabel: 'الوقت', guestsLabel: 'عدد الأشخاص',
    notesLabel: 'ملاحظات', notesPlaceholder: 'مثلاً: طاولة داخلية، مناسبة خاصة…', confirmBooking: 'إرسال طلب الحجز',
    reservationSuccess: 'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.',
    reservationError: 'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.',
    experience: 'THE ARABISK EXPERIENCE', aboutTitle: 'أكثر من مجرد وجبة',
    aboutLead: 'هوية عربية دافئة، تفاصيل فاخرة، وأطباق صُممت لتُشارك وتُستمتع بها.',
    copyright: '© 2026 ARABISK. All rights reserved.'
  },
  en: {
    home: 'Home', menu: 'Explore Menu', events: 'Experiences', reservationNav: 'Book a Table', about: 'About Us', contact: 'Contact Us',
    exploreMenu: 'Explore Menu', reserveHome: 'Book Your Table',
    reservationEyebrow: 'TABLE RESERVATION', reservationTitle: 'Book Your Table',
    reservationLead: 'Choose the date, time and number of guests. We will contact you to confirm your reservation.',
    nameLabel: 'Name', phoneLabel: 'Phone Number', dateLabel: 'Date', timeLabel: 'Time', guestsLabel: 'Guests',
    notesLabel: 'Notes', notesPlaceholder: 'For example: indoor table, special occasion…', confirmBooking: 'Send Reservation Request',
    reservationSuccess: 'Your reservation request was received. We will contact you to confirm.',
    reservationError: 'Unable to submit the reservation right now. Please try again.',
    experience: 'THE ARABISK EXPERIENCE', aboutTitle: 'More Than Just a Meal',
    aboutLead: 'A warm Arabic identity, refined details and dishes designed to be shared and enjoyed.',
    copyright: '© 2026 ARABISK. All rights reserved.'
  }
};

let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

function applyLanguage() {
  const dict = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = location.pathname === '/reservation' ? (language === 'ar' ? 'حجز طاولة — ARABISK' : 'Book a Table — ARABISK') : 'ARABISK — Restaurant & Cafe';

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (dict[key] !== undefined) element.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) element.placeholder = dict[key];
  });

  const toggle = $('#lang-toggle');
  if (toggle) toggle.textContent = language === 'ar' ? 'EN' : 'ع';
}

function localToday() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function applyReservationEventContext() { const badge=$('#reservation-event'); if(!badge || location.pathname.replace(/\/$/,'') !== '/reservation') return; const slug=new URLSearchParams(location.search).get('event'); if(!slug){badge.hidden=true;return} try{const response=await fetch('/api/experiences/'+encodeURIComponent(slug),{cache:'no-store'});if(!response.ok)throw new Error();const event=await response.json();badge.textContent='الحجز لهذه التجربة: '+(event.titleAr||event.titleEn);badge.hidden=false;const notes=$('#reservation-notes');if(notes&&!notes.value)notes.value='حجز فعالية: '+(event.titleAr||event.titleEn);}catch{badge.hidden=true} }

function showPage() {
  const reservation = $('#reservation');
  const home = $('#home');
  const homeActions = $('#home-actions');
  const about = $('#about');

  if (!reservation || !home || !homeActions || !about) return;

  const isReservation = location.pathname.replace(/\/$/, '') === '/reservation';
  home.hidden = isReservation;
  homeActions.hidden = isReservation;
  about.hidden = isReservation;
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('#reservation-name')?.value || '',
        phone: $('#reservation-phone')?.value || '',
        date: date?.value || '',
        time: $('#reservation-time')?.value || '',
        guests: Number($('#reservation-guests')?.value || 0),
        notes: $('#reservation-notes')?.value || ''
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

showPage();

window.addEventListener('pageshow', showPage);
