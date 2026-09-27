const $ = selector => document.querySelector(selector);

const translations = {
  ar: {
    heroTitleA:'اكتشف مذاقًا', heroTitleB:'عربيًا بروح عصرية', heroKicker:'ARABISK · RESTAURANT & CAFE', heroLead:'طعام، ضيافة وتجارب تُصنع بهدوء. اختر ما يناسبك وابدأ زيارتك التالية إلى ARABISK.', quickMenu:'المنيو', quickMenuCopy:'تصفح القائمة والمنتجات', quickReserve:'الحجز', quickReserveCopy:'اختر الوقت وعدد الضيوف', quickCart:'السلة', quickCartCopy:'راجع طلبك وأكمل الشراء', quickEvents:'الفعاليات', quickEventsCopy:'اكتشف التجارب القادمة',
    reservationEyebrow:'TABLE RESERVATION', reservationTitle:'احجز طاولتك',
    reservationLead:'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.',
    nameLabel:'الاسم', phoneLabel:'رقم الهاتف', dateLabel:'التاريخ', timeLabel:'الوقت', guestsLabel:'عدد الأشخاص',
    notesLabel:'ملاحظات', notesPlaceholder:'مثلاً: طاولة داخلية، مناسبة خاصة…', confirmBooking:'إرسال طلب الحجز',
    reservationSuccess:'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.',
    reservationError:'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.',
    experience:'THE ARABISK EXPERIENCE', aboutTitle:'أكثر من مجرد وجبة',
    aboutLead:'هوية عربية دافئة، تفاصيل فاخرة، وأطباق صُممت لتُشارك وتُستمتع بها.',
    copyright:'© 2026 ARABISK. All rights reserved.'
  },
  en: {
    heroTitleA:'Discover Arabic Flavor', heroTitleB:'Reimagined for Today', heroKicker:'ARABISK · RESTAURANT & CAFE', heroLead:'Food, hospitality and experiences crafted with intention. Choose what fits your visit and start your next ARABISK moment.', quickMenu:'Menu', quickMenuCopy:'Browse dishes and products', quickReserve:'Reservation', quickReserveCopy:'Choose a time and guests', quickCart:'Cart', quickCartCopy:'Review your order and checkout', quickEvents:'Experiences', quickEventsCopy:'Discover upcoming experiences',
    reservationEyebrow:'TABLE RESERVATION', reservationTitle:'Book Your Table',
    reservationLead:'Choose the date, time and number of guests. We will contact you to confirm your reservation.',
    nameLabel:'Name', phoneLabel:'Phone Number', dateLabel:'Date', timeLabel:'Time', guestsLabel:'Guests',
    notesLabel:'Notes', notesPlaceholder:'For example: indoor table, special occasion…', confirmBooking:'Send Reservation Request',
    reservationSuccess:'Your reservation request was received. We will contact you to confirm.',
    reservationError:'Unable to submit the reservation right now. Please try again.',
    experience:'THE ARABISK EXPERIENCE', aboutTitle:'More Than Just a Meal',
    aboutLead:'A warm Arabic identity, refined details and dishes designed to be shared and enjoyed.',
    copyright:'© 2026 ARABISK. All rights reserved.'
  }
};

let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

function applyLanguage() {
  const dict = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = location.pathname.replace(/\/$/,'') === '/reservation'
    ? (language === 'ar' ? 'حجز طاولة — ARABISK' : 'Book a Table — ARABISK')
    : 'ARABISK — Restaurant & Cafe';

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = dict[element.dataset.i18n];
    if (value !== undefined) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const value = dict[element.dataset.i18nPlaceholder];
    if (value !== undefined) element.placeholder = value;
  });

  const toggle = $('#lang-toggle');
  if (toggle) toggle.textContent = language === 'ar' ? 'EN' : 'ع';
  window.dispatchEvent(new CustomEvent('arabisk:language-updated', { detail: { language } }));
}

function setupHeaderMenu() {
  const button = $('#app-menu-button');
  const nav = $('#app-header-nav');
  if (!button || !nav) return;

  button.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '×' : '☰';
  });
  nav.addEventListener('click', () => {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded','false');
    button.textContent = '☰';
  });
}

function localToday() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function applyReservationEventContext() {
  const badge = $('#reservation-event');
  if (!badge || location.pathname.replace(/\/$/,'') !== '/reservation') return;

  const slug = new URLSearchParams(location.search).get('event');
  if (!slug) { badge.hidden = true; return; }

  try {
    const response = await fetch('/api/experiences/' + encodeURIComponent(slug), { cache:'no-store' });
    if (!response.ok) throw new Error('experience lookup failed');
    const event = await response.json();
    const title = event.titleAr || event.titleEn;
    badge.textContent = 'الحجز لهذه التجربة: ' + title;
    badge.hidden = false;
    const notes = $('#reservation-notes');
    if (notes && !notes.value) notes.value = 'حجز فعالية: ' + title;
  } catch {
    badge.hidden = true;
  }
}

function showPage() {
  const reservation = $('#reservation');
  const home = $('#home');
  const about = $('#about');
  const homeActions = $('#home-actions');
  const homeSections = document.querySelectorAll('.app-content > .app-section');
  if (!reservation || !home || !about) return;

  const isReservation = location.pathname.replace(/\/$/,'') === '/reservation';
  home.hidden = isReservation;
  if (homeActions) homeActions.hidden = isReservation;
  homeSections.forEach(section => { section.hidden = isReservation; });
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
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:$('#reservation-name')?.value || '',
        phone:$('#reservation-phone')?.value || '',
        date:date?.value || '',
        time:$('#reservation-time')?.value || '',
        guests:Number($('#reservation-guests')?.value || 0),
        notes:$('#reservation-notes')?.value || '',
        eventSlug:new URLSearchParams(location.search).get('event') || ''
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
