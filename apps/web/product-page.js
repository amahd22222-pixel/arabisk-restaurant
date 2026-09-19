(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const money = value => `AED ${Number(value || 0).toFixed(0)}`;
  const pathParts = decodeURIComponent(location.pathname.replace(/\/$/, '')).split('/');
  const categoryKey = pathParts[2] || '';
  const productKey = pathParts[3] || '';

  const loading = document.querySelector('#loading');
  const root = document.querySelector('#product');
  const MENU_CACHE_KEY = 'arabisk-menu-cache-v1';
  const MENU_CACHE_TTL = 30000;
  const feedback = document.querySelector('#feedback');
  let current = null;
  let quantity = 1;
  let cartPromise = null;

  function setLoading(message) {
    if (!loading) return;
    loading.textContent = message;
    loading.hidden = false;
    loading.classList.toggle('error', message !== 'جاري تحميل المنتج…');
  }

  function readMenuCache() {
    try {
      const value = JSON.parse(sessionStorage.getItem(MENU_CACHE_KEY) || 'null');
      return value && value.savedAt && Date.now() - value.savedAt < MENU_CACHE_TTL &&
        Array.isArray(value.categories) && Array.isArray(value.products) ? value : null;
    } catch {
      return null;
    }
  }

  function writeMenuCache(categories, products) {
    try {
      sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify({savedAt: Date.now(), categories, products}));
    } catch {}
  }

  async function loadMenuData() {
    const cached = readMenuCache();
    if (cached) return {categories: cached.categories, products: cached.products};
    const [categories, products] = await Promise.all([
      fetchJson('/api/categories', 9000),
      fetchJson('/api/products', 9000)
    ]);
    writeMenuCache(categories, products);
    return {categories, products};
  }
  async function fetchJson(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {cache:'no-store', signal:controller.signal});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function loadCartRuntime() {
    if (window.ARABISK_CART) return Promise.resolve(true);
    if (cartPromise) return cartPromise;
    cartPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = `./cart.js?v=20260919.3`;
      script.defer = true;
      script.onload = () => resolve(Boolean(window.ARABISK_CART));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(Boolean(window.ARABISK_CART)), 5000);
    });
    return cartPromise;
  }

  function setQuantity(delta) {
    quantity = Math.max(1, Math.min(20, quantity + delta));
    const node = document.querySelector('#quantity');
    if (node) node.textContent = String(quantity);
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

  function fail(message) {
    console.error('[ARABISK product]', message);
    setLoading(message);
    if (root) root.hidden = true;
  }

  async function bindProduct(product, category, allProducts) {
    current = product;
    document.title = `${product.nameAr || product.nameEn} — ARABISK`;
    document.querySelector('#back').href = `/menu/${slug(category.id)}`;
    document.querySelector('#category').textContent = (category.nameEn || 'MENU').toUpperCase();
    document.querySelector('#name-ar').textContent = product.nameAr || product.nameEn || 'منتج';
    document.querySelector('#name-en').textContent = product.nameEn || '';
    document.querySelector('#description').textContent = product.descriptionAr || product.descriptionEn || 'اختيار مميز من قائمة ARABISK.';
    document.querySelector('#price').textContent = money(product.price);
    document.querySelector('#availability').textContent = product.available === false ? 'غير متوفر' : 'متوفر';
    document.querySelector('#hero-image').style.backgroundImage = product.imageUrl ? `url('${esc(product.imageUrl)}')` : '';
    renderBadges(product);
    renderFacts(product);
    renderGallery(product);
    renderRelated(category, allProducts, product);

    document.querySelector('#minus').onclick = () => setQuantity(-1);
    document.querySelector('#plus').onclick = () => setQuantity(1);
    document.querySelector('#add').onclick = async () => {
      const ready = await loadCartRuntime();
      if (!ready || !window.ARABISK_CART?.add) {
        feedback.textContent = 'تعذر فتح السلة حاليًا. حاول إعادة تحميل الصفحة.';
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
        if (navigator.share) await navigator.share({title:current.nameAr || current.nameEn, text:current.descriptionAr || '', url:location.href});
        else if (navigator.clipboard) { await navigator.clipboard.writeText(location.href); feedback.textContent = 'تم نسخ رابط الطبق.'; setTimeout(() => { feedback.textContent = ''; }, 1800); }
      } catch {}
    };
    if (loading) loading.hidden = true;
    if (root) root.hidden = false;
    void loadCartRuntime();

    try {
      const details = await fetchJson(`/api/product-details/${encodeURIComponent(product.id)}`, 5000);
      current = {...current, ...(details && typeof details === 'object' ? details : {})};
      renderDetails(current);
    } catch (error) {
      console.warn('[ARABISK product details]', error.message);
    }
  }

  async function load() {
    try {
      if (!categoryKey || !productKey) throw new Error('مسار المنتج غير صالح.');
      const {categories, products} = await loadMenuData();
      if (!Array.isArray(categories) || !Array.isArray(products)) throw new Error('استجابة المنيو غير صالحة.');

      const category = categories.find(item => slug(item.id) === slug(categoryKey) || String(item.id).toLowerCase() === String(categoryKey).toLowerCase());
      if (!category) throw new Error('لم يتم العثور على القسم المطلوب.');

      let product = products.find(item => slug(item.nameEn || item.nameAr) === slug(productKey));
      if (!product) product = products.find(item => slug(item.id) === slug(productKey));
      if (!product) product = products.find(item => item.categoryId === category.id && (slug(item.nameAr) === slug(productKey) || slug(item.nameEn) === slug(productKey)));
      if (!product) {
        try { product = await fetchJson(`/api/products/${encodeURIComponent(productKey.toUpperCase())}`, 6000); } catch {}
      }
      if (!product || product.available === false) throw new Error('لم يتم العثور على المنتج المطلوب.');

      const actualCategory = categories.find(item => item.id === product.categoryId) || category;
      const related = products.filter(item => item.categoryId === product.categoryId && item.available !== false);
      await bindProduct(product, actualCategory, related);
    } catch (error) {
      fail(error.name === 'AbortError' ? 'انتهت مهلة الاتصال. حاول تحديث الصفحة.' : (error.message || 'تعذر تحميل المنتج.'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void load(), {once:true});
  else void load();
})();
