(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[char]));
  const currency = value => new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-AE' : 'ar-AE', {
    style:'currency', currency:'AED', maximumFractionDigits:2
  }).format(Number(value) || 0);

  const state = { products: [], experiences: [], memories: [], installOffer: null, todayOffer: null };
  let offerTimer;

  const getJson = async (url, fallback) => {
    try {
      const response = await fetch(url, { cache:'no-store' });
      if (!response.ok) return fallback;
      const data = await response.json();
      return data ?? fallback;
    } catch { return fallback; }
  };

  const productImage = product => product?.imageUrl ||
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=82';

  function syncCartCount() {
    const target = $('#app-cart-count');
    if (!target) return;
    const items = window.ARABISK_CART?.getItems?.() || [];
    const quantity = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    target.textContent = String(quantity);
    target.hidden = quantity < 1;
  }

  function renderFeatured() {
    const root = $('#app-featured-products');
    if (!root) return;

    const products = state.products
      .filter(item => item && item.available !== false)
      .sort((a,b) =>
        Number(Boolean(b.chefChoice)) - Number(Boolean(a.chefChoice)) ||
        Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)) ||
        (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999)
      ).slice(0, 6);

    if (!products.length) {
      root.innerHTML = '<div class="home-empty">القائمة متاحة بالكامل داخل المنيو.</div>';
      return;
    }

    root.innerHTML = products.map(product => {
      const badge = product.chefChoice ? 'اختيار الشيف' : (product.isNew ? 'جديد' : 'مختار لـ ARABISK');
      return `
        <a class="product-teaser" href="/menu/${encodeURIComponent(String(product.categoryId || ''))}/${encodeURIComponent(String(product.id || ''))}" data-product-id="${esc(product.id)}">
          <div class="product-teaser-media"><img src="${esc(productImage(product))}" alt="${esc(product.nameAr || product.nameEn)}" loading="lazy" decoding="async"></div>
          <div class="product-teaser-copy">
            <span class="product-teaser-badge">${esc(badge)}</span>
            <h3>${esc(product.nameAr || product.nameEn)}</h3>
            <p>${esc(product.descriptionAr || product.descriptionEn || 'اختيار مميز من قائمة ARABISK.')}</p>
            <div class="product-teaser-foot">
              <strong class="product-price">${esc(currency(product.price))}</strong>
              <span class="product-add" data-add-product="${esc(product.id)}" aria-label="إضافة إلى السلة">+</span>
            </div>
          </div>
        </a>`;
    }).join('');

    $$('.product-teaser', root).forEach(card => {
      const addButton = $('[data-add-product]', card);
      addButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const item = state.products.find(product => String(product.id) === String(addButton.dataset.addProduct));
        if (item && window.ARABISK_CART?.add) {
          window.ARABISK_CART.add(item, 1);
          syncCartCount();
        }
      });
    });
  }

  function renderTodayOffer() {
    const root = $('#today-offer');
    if (!root) return;

    window.clearInterval(offerTimer);
    const offer = state.todayOffer;
    const install = state.installOffer;
    const product = offer?.productId
      ? state.products.find(item => String(item.id) === String(offer.productId) && item.available !== false)
      : null;

    const badge = $('.today-offer-badge', root);
    const title = $('.today-offer-title', root);
    const copy = $('.today-offer-note', root);
    const action = $('.today-offer-action', root);
    const image = $('.today-offer-media img', root);
    if (!badge || !title || !copy || !action || !image) return;

    let targetTime = '';
    if (offer?.enabled) {
      badge.textContent = offer.badge || 'عرض اليوم';
      title.textContent = offer.title || (product?.nameAr || 'عرض اليوم');
      copy.textContent = offer.message || 'عرض خاص من ARABISK متاح اليوم.';
      action.textContent = offer.ctaLabel || 'اطلب الآن';
      action.href = product
        ? `/menu/${encodeURIComponent(String(product.categoryId || ''))}/${encodeURIComponent(String(product.id || ''))}`
        : '/menu';
      image.src = productImage(product || {});
      image.alt = product?.nameAr || offer.title || 'عرض اليوم من ARABISK';
      targetTime = offer.endsAt || '';
    } else if (install?.enabled) {
      badge.textContent = `ميزة التطبيق · خصم ${Math.round(Number(install.discountValue) || 0)}%`;
      title.textContent = install.title || 'خصم خاص لعملاء ARABISK';
      copy.textContent = install.message || 'ثبّت ARABISK على شاشتك الرئيسية واحصل على كودك الشخصي.';
      action.textContent = 'اذهب إلى السلة';
      action.href = '/cart';
      image.src = productImage(product || {});
      image.alt = 'تجربة ARABISK';
    } else if (product) {
      badge.textContent = 'اختيار اليوم';
      title.textContent = product.nameAr || product.nameEn || 'اختيار اليوم';
      copy.textContent = product.descriptionAr || product.descriptionEn || 'اختيار مميز من مطبخ ARABISK.';
      action.textContent = 'اطلب الآن';
      action.href = `/menu/${encodeURIComponent(String(product.categoryId || ''))}/${encodeURIComponent(String(product.id || ''))}`;
      image.src = productImage(product);
      image.alt = product.nameAr || product.nameEn || 'طبق اليوم';
    }

    let timer = $('.today-offer-timer', root);
    if (!timer) {
      timer = document.createElement('span');
      timer.className = 'today-offer-timer';
      $('.today-offer-copy', root)?.insertBefore(timer, action);
    }

    if (targetTime && Number.isFinite(Date.parse(targetTime))) {
      const tick = () => {
        const remaining = Date.parse(targetTime) - Date.now();
        if (remaining <= 0) {
          timer.hidden = true;
          window.clearInterval(offerTimer);
          return;
        }
        const totalMinutes = Math.floor(remaining / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        timer.textContent = days > 0
          ? `ينتهي خلال ${days} يوم ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`
          : `ينتهي خلال ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
        timer.hidden = false;
      };
      tick();
      offerTimer = window.setInterval(tick, 30000);
    } else timer.hidden = true;
  }

  function renderExperience() {
    const root = $('#home-experience');
    if (!root) return;
    const now = Date.now();
    const event = state.experiences.find(item => {
      const date = Date.parse(item.startsAt || '');
      return (item.status === undefined || item.status === 'published') &&
        (!Number.isFinite(date) || date >= now - 6 * 60 * 60 * 1000);
    }) || state.experiences[0];

    if (!event) {
      root.innerHTML = '<div class="home-empty">تابع صفحة الفعاليات لمعرفة التجارب القادمة في ARABISK.</div>';
      return;
    }

    const cover = event.coverImageUrl || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=82';
    const date = Date.parse(event.startsAt || '');
    const dateText = Number.isFinite(date)
      ? new Intl.DateTimeFormat('ar-AE',{day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}).format(new Date(date))
      : 'التاريخ يعلن قريبًا';

    root.innerHTML = `
      <div class="experience-card">
        <div class="experience-media"><img src="${esc(cover)}" alt="${esc(event.titleAr || event.titleEn || 'ARABISK Experience')}" loading="lazy"></div>
        <div class="experience-copy">
          <p class="app-eyebrow">${esc(event.eyebrow || 'ARABISK EXPERIENCES')}</p>
          <h3>${esc(event.titleAr || event.titleEn || 'تجربة ARABISK')}</h3>
          <p>${esc(event.descriptionAr || event.descriptionEn || 'تجربة خاصة في ARABISK تجمع الأجواء والطعام والضيافة.')}</p>
          <div class="experience-meta"><span>${esc(dateText)}</span>${event.location ? `<span>${esc(event.location)}</span>` : ''}</div>
          <a class="experience-action" href="/events/${encodeURIComponent(String(event.slug || event.id || ''))}">اكتشف التجربة ←</a>
        </div>
      </div>`;
  }

  function renderMemories() {
    const root = $('#home-memories');
    if (!root) return;
    const memories = Array.isArray(state.memories) ? state.memories.slice(0, 4) : [];
    if (!memories.length) {
      root.innerHTML = '<div class="home-empty" style="grid-column:1/-1">شارك لحظتك مع ARABISK لتظهر هنا.</div>';
      return;
    }

    root.innerHTML = memories.map(memory => {
      const isVideo = memory.mediaType === 'video' && memory.videoUrl;
      const media = isVideo
        ? `<video src="${esc(memory.videoUrl)}" muted loop autoplay playsinline preload="metadata"></video>`
        : (memory.imageUrl
          ? `<img src="${esc(memory.imageUrl)}" alt="${esc(memory.displayName || 'ARABISK Memory')}" loading="lazy" decoding="async">`
          : '<span></span>');
      return `<a class="memory-tile" href="/memories">${media}<span>${esc(memory.displayName || 'زائر ARABISK')}</span></a>`;
    }).join('');
  }

  function setupMobileMenu() {
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

  async function init() {
    if (location.pathname.replace(/\/$/,'') !== '') return;
    setupMobileMenu();
    syncCartCount();

    const [products, experiences, memories, installOffer, todayOffer] = await Promise.all([
      getJson('/api/products', []),
      getJson('/api/experiences', []),
      getJson('/api/memories?limit=4', []),
      getJson('/api/promotions/install', null),
      getJson('/api/promotions/today', null)
    ]);

    state.products = Array.isArray(products) ? products : [];
    state.experiences = Array.isArray(experiences) ? experiences : [];
    state.memories = Array.isArray(memories) ? memories : [];
    state.installOffer = installOffer;
    state.todayOffer = todayOffer;

    renderFeatured();
    renderTodayOffer();
    renderExperience();
    renderMemories();

    window.addEventListener('arabisk-cart-updated', syncCartCount);
    window.addEventListener('storage', syncCartCount);
    window.addEventListener('pageshow', syncCartCount);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once:true })
    : init();
})();