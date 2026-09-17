const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const money = value => `AED ${Number(value || 0).toFixed(0)}`;

const loading = document.querySelector('#loading');
const root = document.querySelector('#product');
const feedback = document.querySelector('#feedback');
const pathParts = decodeURIComponent(location.pathname.replace(/\/$/, '')).split('/');
const categoryKey = pathParts[2] || '';
const productKey = pathParts[3] || '';
let current = null;
let quantity = 1;

const api = async url => {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
  return data;
};

async function ensureCartRuntime() {
  if (window.ARABISK_CART) return true;
  try { await import('./cart.js'); } catch (error) { console.error('ARABISK cart runtime:', error); }
  return Boolean(window.ARABISK_CART);
}

function setQuantity(delta) {
  quantity = Math.max(1, Math.min(20, quantity + delta));
  document.querySelector('#quantity').textContent = String(quantity);
}

function renderBadges(product) {
  const smart = product.smart || {};
  const badges = [];
  if (smart.popular) badges.push('<span>🔥 الأكثر طلبًا</span>');
  if (smart.isNew) badges.push('<span>جديد</span>');
  if (smart.chefChoice) badges.push('<span>اختيار الشيف</span>');
  if (smart.vegetarian) badges.push('<span>نباتي</span>');
  if (smart.vegan) badges.push('<span>نباتي بالكامل</span>');
  if (smart.glutenFree) badges.push('<span>بدون جلوتين</span>');
  if (smart.spicy) badges.push(`<span class="hot">🌶️ حار${Number(smart.spiceLevel) > 1 ? ` — ${'★'.repeat(Number(smart.spiceLevel))}` : ''}</span>`);
  document.querySelector('#badges').innerHTML = badges.join('');
  document.querySelector('#badges-image').innerHTML = badges.slice(0, 3).join('');
}

function renderFacts(product) {
  const smart = product.smart || {};
  const facts = [];
  const portion = product.portion || product.size || product.serving || '';
  if (portion) facts.push(`<div class="fact"><small>الحجم / الحصة</small><strong>${esc(portion)}</strong></div>`);
  if (Number(smart.spiceLevel) > 0) facts.push(`<div class="fact"><small>مستوى الحِدة</small><strong>${'🌶️'.repeat(Number(smart.spiceLevel))}</strong></div>`);
  const dietary = Array.isArray(product.dietary) ? product.dietary : (Array.isArray(smart.dietary) ? smart.dietary : []);
  if (dietary.length) facts.push(`<div class="fact"><small>الخيارات الغذائية</small><strong>${dietary.map(esc).join(' · ')}</strong></div>`);
  const node = document.querySelector('#facts');
  node.innerHTML = facts.join('');
  node.hidden = facts.length === 0;
}

function renderDetails(product) {
  const details = [];
  const ingredients = product.ingredientsAr || product.ingredients || '';
  const allergens = Array.isArray(product.allergens) ? product.allergens : [];
  const notes = product.notesAr || product.notes || '';
  if (ingredients) details.push(`<article class="detail-card"><h3>المكونات</h3><p>${esc(ingredients)}</p></article>`);
  if (allergens.length) details.push(`<article class="detail-card"><h3>الحساسية الغذائية</h3><div class="allergens">${allergens.map(item => `<span>${esc(item)}</span>`).join('')}</div></article>`);
  if (notes) details.push(`<article class="detail-card"><h3>ملاحظات</h3><p>${esc(notes)}</p></article>`);
  const section = document.querySelector('#details-section');
  document.querySelector('#details').innerHTML = details.join('');
  section.hidden = details.length === 0;
}

function renderGallery(product) {
  const urls = [product.imageUrl, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
  const unique = [...new Set(urls)];
  const gallery = document.querySelector('#gallery');
  if (unique.length < 2) {
    gallery.hidden = true;
    return;
  }
  gallery.hidden = false;
  gallery.innerHTML = unique.map((url, index) => `<button class="thumb${index === 0 ? ' active' : ''}" type="button" data-image="${esc(url)}" style="background-image:url('${esc(url)}')" aria-label="صورة ${index + 1}"></button>`).join('');
  gallery.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('#hero-image').style.backgroundImage = `url('${esc(button.dataset.image)}')`;
    gallery.querySelectorAll('.thumb').forEach(item => item.classList.toggle('active', item === button));
  }));
}

function renderRelated(category, items, product) {
  const related = items.filter(item => item.id !== product.id && item.available !== false).slice(0, 6);
  document.querySelector('#related').innerHTML = related.map(item => {
    const target = `/menu/${slug(category.id)}/${slug(item.nameEn || item.nameAr)}`;
    return `<a class="related-card related-link" href="${target}"><div class="related-image" style="background-image:url('${esc(item.imageUrl || '')}')"></div><div class="related-body"><h3>${esc(item.nameAr || item.nameEn)}</h3><p>${money(item.price)}</p></div></a>`;
  }).join('') || '<p class="section-lead">لا توجد أصناف أخرى في هذا القسم حاليًا.</p>';
}

function showError(error) {
  console.error('ARABISK product page:', error);
  loading.classList.add('error');
  loading.textContent = 'تعذر تحميل المنتج حاليًا. جرّب تحديث الصفحة أو العودة إلى القسم.';
  root.hidden = true;
}

async function load() {
  try {
    if (!categoryKey || !productKey) throw new Error('invalid route');

    const [categories, products] = await Promise.all([
      api('/api/categories'),
      api('/api/products')
    ]);

    if (!Array.isArray(categories) || !Array.isArray(products)) throw new Error('Invalid menu response');

    let category = categories.find(item => slug(item.id) === categoryKey);
    let product = products.find(item => slug(item.nameEn || item.nameAr) === productKey || slug(item.id) === productKey);

    if (!product && /^P\d+$/i.test(productKey)) {
      product = await api(`/api/products/${encodeURIComponent(productKey.toUpperCase())}`);
    }

    if (!product) throw new Error(`product not found: ${productKey}`);
    if (product.available === false) throw new Error('product unavailable');

    category = category || categories.find(item => item.id === product.categoryId);
    if (!category) throw new Error(`category not found: ${categoryKey}`);

    if (product.categoryId !== category.id) {
      category = categories.find(item => item.id === product.categoryId) || category;
    }

    const items = products.filter(item => item.categoryId === product.categoryId && item.available !== false);

    let details = {};
    try {
      details = await api(`/api/product-details/${encodeURIComponent(product.id)}`);
    } catch (error) {
      console.warn('Product details unavailable:', error.message);
    }

    current = { ...product, ...(details && typeof details === 'object' ? details : {}) };
    document.title = `${current.nameAr || current.nameEn} — ARABISK`;
    document.querySelector('#back').href = `/menu/${slug(category.id)}`;
    document.querySelector('#category').textContent = (category.nameEn || 'MENU').toUpperCase();
    document.querySelector('#name-ar').textContent = current.nameAr || current.nameEn;
    document.querySelector('#name-en').textContent = current.nameEn || '';
    document.querySelector('#description').textContent = current.descriptionAr || current.descriptionEn || 'اختيار مميز من قائمة ARABISK.';
    document.querySelector('#price').textContent = money(current.price);
    document.querySelector('#availability').textContent = current.available === false ? 'غير متوفر' : 'متوفر';

    const hero = document.querySelector('#hero-image');
    hero.style.backgroundImage = current.imageUrl ? `url('${esc(current.imageUrl)}')` : '';

    renderBadges(current);
    renderFacts(current);
    renderDetails(current);
    renderGallery(current);
    renderRelated(category, items, current);

    document.querySelector('#minus').onclick = () => setQuantity(-1);
    document.querySelector('#plus').onclick = () => setQuantity(1);
    document.querySelector('#add').onclick = async () => {
      if (!window.ARABISK_CART) await ensureCartRuntime();
      if (!window.ARABISK_CART?.add) {
        feedback.textContent = 'تعذر فتح السلة حاليًا. أعد تحميل الصفحة.';
        return;
      }
      window.ARABISK_CART.add(current, quantity);
      feedback.textContent = `تمت إضافة ${quantity} × ${current.nameAr || current.nameEn} إلى طلبك.`;
      quantity = 1;
      document.querySelector('#quantity').textContent = '1';
      setTimeout(() => { feedback.textContent = ''; }, 2200);
    };

    document.querySelector('#share').onclick = async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: current.nameAr || current.nameEn, text: current.descriptionAr || '', url: location.href });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(location.href);
          feedback.textContent = 'تم نسخ رابط الطبق.';
          setTimeout(() => { feedback.textContent = ''; }, 1800);
        }
      } catch {}
    };

    loading.hidden = true;
    root.hidden = false;
    void ensureCartRuntime();
  } catch (error) {
    showError(error);
  }
}

void load();
