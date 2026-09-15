const categoryView = document.querySelector('#category-view');
const categoryDetail = document.querySelector('#category-detail');
const grid = document.querySelector('#grid');
const searchInput = document.querySelector('#menu-search');
const backButton = document.querySelector('#back-to-categories');
const detailTitle = document.querySelector('#detail-title');
const detailEyebrow = document.querySelector('#detail-eyebrow');
const API = '/api/products';
const CATEGORY_API = '/api/categories';
const translations = {
  ar: { home:'الرئيسية', menu:'المنيو', reservationNav:'حجز طاولة', about:'عن المطعم', contact:'تواصل معنا', eyebrow:'RESTAURANT & CAFE', hero1:'مذاق عربي', hero2:'بروح عصرية', lead:'تجربة ضيافة عربية تجمع بين الأطباق الأصيلة والأجواء الراقية.', explore:'استكشف المنيو', bookTable:'احجز طاولتك', heroCard:'Authentic<br/>Arabic Taste', ourMenu:'OUR MENU', menuTitle:'قائمة الطعام', menuLead:'اختر قسمًا لعرض الأصناف الخاصة به', backToCategories:'← كل الأقسام', searchLabel:'بحث', searchPlaceholder:'ابحث داخل القسم…', experience:'THE ARABISK EXPERIENCE', aboutTitle:'أكثر من مجرد وجبة', aboutLead:'هوية عربية دافئة، تفاصيل فاخرة، وأطباق صُممت لتُشارك وتُستمتع بها.', copyright:'© 2026 ARABISK. All rights reserved.', reservationEyebrow:'TABLE RESERVATION', reservationTitle:'احجز طاولتك', reservationLead:'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.', nameLabel:'الاسم', phoneLabel:'رقم الهاتف', dateLabel:'التاريخ', timeLabel:'الوقت', guestsLabel:'عدد الأشخاص', notesLabel:'ملاحظات', notesPlaceholder:'مثلاً: طاولة داخلية، مناسبة خاصة…', confirmBooking:'إرسال طلب الحجز', bookingSuccess:'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.', bookingError:'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.', prepEyebrow:'PREPARATION VIDEO', watchVideo:'شاهد طريقة التحضير', videoUnavailable:'فيديو التحضير غير متوفر لهذا الصنف.', noItems:'لا توجد أصناف في هذا القسم حالياً.' },
  en: { home:'Home', menu:'Menu', reservationNav:'Book a Table', about:'About Us', contact:'Contact', eyebrow:'RESTAURANT & CAFE', hero1:'Authentic Arabic', hero2:'with a Modern Spirit', lead:'An Arabic hospitality experience blending authentic dishes with an elegant atmosphere.', explore:'Explore the Menu', bookTable:'Book a Table', heroCard:'Authentic<br/>Arabic Taste', ourMenu:'OUR MENU', menuTitle:'Our Menu', menuLead:'Choose a category to explore its dishes', backToCategories:'← All Categories', searchLabel:'Search', searchPlaceholder:'Search this category…', experience:'THE ARABISK EXPERIENCE', aboutTitle:'More Than a Meal', aboutLead:'A warm Arabic identity, refined details, and dishes designed to be shared and enjoyed.', copyright:'© 2026 ARABISK. All rights reserved.', reservationEyebrow:'TABLE RESERVATION', reservationTitle:'Book a Table', reservationLead:'Choose your date, time and party size and we will contact you to confirm.', nameLabel:'Name', phoneLabel:'Phone', dateLabel:'Date', timeLabel:'Time', guestsLabel:'Guests', notesLabel:'Notes', notesPlaceholder:'For example: indoor table, special occasion…', confirmBooking:'Send Reservation Request', bookingSuccess:'Your reservation request was received. We will contact you to confirm.', bookingError:'Unable to submit the reservation right now. Please try again.', prepEyebrow:'PREPARATION VIDEO', watchVideo:'Watch Preparation', videoUnavailable:'No preparation video is available for this item.', noItems:'No items are available in this category yet.' }
};
let language = localStorage.getItem('ARABISK_LANG') || 'ar';
let categories = [];
let currentCategory = null;
let currentItems = [];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function loadCategories() { const response = await fetch(CATEGORY_API); if (!response.ok) throw new Error('Unable to load categories'); return response.json(); }
async function loadProducts(categoryId = '') { const url = categoryId ? `${API}?category=${encodeURIComponent(categoryId)}` : API; const response = await fetch(url); if (!response.ok) throw new Error('Unable to load menu'); return response.json(); }

function applyLanguage() {
  const strings = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => { const value = strings[node.dataset.i18n]; if (value !== undefined) node.innerHTML = value; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { const value = strings[node.dataset.i18nPlaceholder]; if (value !== undefined) node.placeholder = value; });
  document.querySelector('#lang-toggle').textContent = language === 'ar' ? 'EN' : 'ع';
  document.querySelector('#lang-toggle').setAttribute('aria-label', language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  renderCategories();
  if (currentCategory) renderCategoryItems(currentItems);
}

function renderCategories() {
  const isEn = language === 'en';
  categoryView.innerHTML = categories.filter((category) => category.active !== false).map((category) => `<button class="category-card" type="button" data-category="${escapeHtml(category.id)}"><div class="category-image"><img src="${escapeHtml(category.imageUrl)}" alt="${escapeHtml(isEn ? category.nameEn : category.nameAr)}" loading="lazy"><span class="category-shade"></span></div><div class="category-copy"><span class="cat-en">${escapeHtml(category.nameEn)}</span><h3>${escapeHtml(isEn ? category.nameEn : category.nameAr)}</h3><span class="category-arrow">${isEn ? 'Explore →' : 'اكتشف القسم ←'}</span></div></button>`).join('');
}

function renderCategoryItems(items) {
  const isEn = language === 'en';
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query ? items.filter((item) => `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query)) : items;
  grid.innerHTML = filtered.map((item) => `<article class="item"><span class="cat">${escapeHtml(item.nameEn)}</span><div><h3>${escapeHtml(isEn ? item.nameEn : item.nameAr)}</h3><p>${escapeHtml(isEn ? (item.descriptionEn || 'A signature ARABISK selection.') : (item.descriptionAr || 'اختيار من قائمة ARABISK المميزة'))}</p></div><div class="item-bottom"><div class="price">AED ${Number(item.price).toFixed(0)}</div>${item.videoUrl ? `<button class="video-trigger" type="button" data-video="${escapeHtml(item.videoUrl)}" data-title="${escapeHtml(isEn ? item.nameEn : item.nameAr)}">▶ ${escapeHtml(translations[language].watchVideo)}</button>` : ''}</div></article>`).join('') || `<p class="empty-menu">${translations[language].noItems}</p>`;
}

async function openCategory(categoryId) {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return;
  currentCategory = category;
  detailTitle.textContent = language === 'en' ? category.nameEn : category.nameAr;
  detailEyebrow.textContent = category.nameEn.toUpperCase();
  searchInput.value = '';
  categoryView.hidden = true;
  categoryDetail.hidden = false;
  categoryDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  grid.innerHTML = '<div class="menu-loading"></div><div class="menu-loading"></div><div class="menu-loading"></div>';
  try { currentItems = await loadProducts(category.id); renderCategoryItems(currentItems); } catch (error) { grid.innerHTML = `<p class="empty-menu">${language === 'en' ? 'Unable to load this category.' : 'تعذر تحميل هذا القسم حاليًا.'}</p>`; console.error(error); }
}
function showCategories() { currentCategory = null; currentItems = []; searchInput.value = ''; categoryDetail.hidden = true; categoryView.hidden = false; document.querySelector('#menu').scrollIntoView({ behavior:'smooth', block:'start' }); }

categoryView.addEventListener('click', (event) => { const card = event.target.closest('[data-category]'); if (card) openCategory(card.dataset.category); });
backButton.addEventListener('click', showCategories);
searchInput.addEventListener('input', () => renderCategoryItems(currentItems));
document.querySelector('#lang-toggle').addEventListener('click', () => { language = language === 'ar' ? 'en' : 'ar'; localStorage.setItem('ARABISK_LANG', language); applyLanguage(); });

const videoModal = document.querySelector('#video-modal');
const productVideo = document.querySelector('#product-video');
const videoTitle = document.querySelector('#video-title');
const videoFallback = document.querySelector('#video-fallback');
function openVideo(url, title) { videoTitle.textContent = title; productVideo.src = url; productVideo.hidden = false; videoFallback.hidden = true; videoModal.classList.add('show'); videoModal.setAttribute('aria-hidden', 'false'); productVideo.play().catch(() => {}); }
function closeVideo() { productVideo.pause(); productVideo.removeAttribute('src'); productVideo.load(); videoModal.classList.remove('show'); videoModal.setAttribute('aria-hidden', 'true'); }
grid.addEventListener('click', (event) => { const button = event.target.closest('.video-trigger'); if (button) openVideo(button.dataset.video, button.dataset.title); });
document.querySelector('#video-close').addEventListener('click', closeVideo);
videoModal.addEventListener('click', (event) => { if (event.target === videoModal) closeVideo(); });
productVideo.addEventListener('error', () => { productVideo.hidden = true; videoFallback.hidden = false; });

const reservationForm = document.querySelector('#reservation-form');
const reservationMessage = document.querySelector('#reservation-message');
const reservationDate = document.querySelector('#reservation-date');
const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
reservationDate.min = localToday;
reservationForm.addEventListener('submit', async (event) => { event.preventDefault(); reservationMessage.textContent = ''; const submit = reservationForm.querySelector('button[type="submit"]'); submit.disabled = true; try { const response = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#reservation-name').value, phone: document.querySelector('#reservation-phone').value, date: reservationDate.value, time: document.querySelector('#reservation-time').value, guests: Number(document.querySelector('#reservation-guests').value), notes: document.querySelector('#reservation-notes').value }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Reservation failed'); reservationMessage.textContent = translations[language].bookingSuccess; reservationForm.reset(); document.querySelector('#reservation-guests').value = '2'; reservationDate.min = localToday; } catch (error) { reservationMessage.textContent = translations[language].bookingError; console.error(error); } finally { submit.disabled = false; } });

async function bootstrap() { try { categories = await loadCategories(); renderCategories(); } catch (error) { categoryView.innerHTML = `<p class="empty-menu">${language === 'en' ? 'Unable to load categories.' : 'تعذر تحميل الأقسام حاليًا.'}</p>`; console.error(error); } }
applyLanguage();
bootstrap();
