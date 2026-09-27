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

  const state = { products: [], experiences: [], memories: [], installOffer: null };

  const getJson = async (url, fallback) => {
    try {
      const response = await fetch(url, { cache:'no-store' });
      if (!response.ok) return fallback;
      const data = await response.json();
      return data ?? fallback;
    } catch {
      return fallback;
    }
  };

  const productImage = product => product?.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=82';

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
      )
      .slice(0, 6);

    if (!products.length) {
      root.innerHTML = '<div class="home-empty">القائمة متاحة بالكامل داخل المنيو.</div>';
      return;
    }

    root.innerHTML = products.map(product => {
      const badge = product.chefChoice ? 'اختيار الشيف' : (product.isNew ? 'جديد' : 'مختار لـ ARABISK');
      return `
        <a class="product-teaser" href="/menu/${encodeURIComponent(String(product.categoryId || ''))}/${encodeURIComponent(String(product.id || ''))}" data-product-id="${esc(product.id)}">
          <div class="product-teaser-media">
            <img src="${esc(productImage(product))}" alt="${esc(product.nameAr || product.nameEn)}" loading="lazy" decoding="async">
          </div>
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
      const img = $('img', card);
      img?.addEventListener('error', () => { img.removeAttribute('src'); }, { once:true });
    });
  }

  function renderOffer() {
    const root = $('#today-offer');
    if (!root) return;

    const offer = state.installOffer;
    const featured = state.products.find(item => item && item.available !== false && (item.chefChoice || item.isNew)) || state.products.find(item => item?.available !== false);

    const offerImage = $('.today-offer-media img', root);
    if (offerImage && featured) {
      offerImage.src = productImage(featured);
      offerImage.alt = featured.nameAr || featured.nameEn || 'اختيار اليوم من ARABISK';
    }

    if (offer?.enabled) {
      $('.today-offer-badge', root).textContent = `خصم ${Math.round(Number(offer.discountValue) || 0)}% للتطبيق`;
      $('.today-offer-title', root).textContent = 'خصم خاص لعملاء ARABISK';
      $('.today-offer-note', root).textContent = offer.message || 'ثبّت ARABISK على شاشتك الرئيسية واحصل على كودك الشخصي.';
      $('.today-offer-action', root).setAttribute('href', '/cart');
      return;
    }

    if (featured) {
      $('.today-offer-badge', root).textContent = 'اختيار اليوم';
      $('.today-offer-title', root).textContent = featured.nameAr || featured.nameEn || 'طبق اليوم';
      $('.today-offer-note', root).textContent = featured.descriptionAr || featured.descriptionEn || 'اختيار مميز من مطبخ ARABISK.';
      $('.today-offer-action', root).setAttribute('href', `/menu/${encodeURIComponent(String(featured.categoryId || ''))}/${encodeURIComponent(String(featured.id || ''))}`);
    }
  }

  function renderExperience() {
    const root = $('#home-experience');
    if (!root) return;
    const now = Date.now();
    const event = state.experiences.find(item => {
      const date = Date.parse(item.startsAt || '');
      return item.status === undefined || item.status === 'published'
        ? (!Number.isFinite(date) || date >= now - 6 * 60 * 60 * 1000)
        : false;
    }) || state.experiences[0];

    if (!event) {
      root.innerHTML = '<div class="home-empty">تابع صفحة الفعاليات لمعرفة التجارب القادمة في ARABISK.</div>';
      return;
    }

    const cover = event.coverImageUrl || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=82';
    const date = Date.parse(event.startsAt || '');
    const dateText = Number.isFinite(date) ? new Intl.DateTimeFormat('ar-AE',{day:'numeric',month:'long',hour:'numeric',minute:'2-digit'}).format(new Date(date)) : 'التاريخ يعلن قريبًا';
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
        : (memory.imageUrl ? `<img src="${esc(memory.imageUrl)}" alt="${esc(memory.displayName || 'ARABISK Memory')}" loading="lazy" decoding="async">` : '<span></span>');
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

  function handleLanguageUpdate() {
    syncCartCount();
    renderFeatured();
  }

  async function init() {
    if (location.pathname.replace(/\/$/,'') !== '') return;

    setupMobileMenu();
    syncCartCount();

    const [products, experiences, memories, installOffer] = await Promise.all([
      getJson('/api/products', []),
      getJson('/api/experiences', []),
      getJson('/api/memories?limit=4', []),
      getJson('/api/promotions/install', null)
    ]);

    state.products = Array.isArray(products) ? products : [];
    state.experiences = Array.isArray(experiences) ? experiences : [];
    state.memories = Array.isArray(memories) ? memories : [];
    state.installOffer = installOffer;

    renderFeatured();
    renderOffer();
    renderExperience();
    renderMemories();

    window.addEventListener('arabisk-cart-updated', syncCartCount);
    window.addEventListener('storage', syncCartCount);
    window.addEventListener('arabisk:language-updated', handleLanguageUpdate);
    window.addEventListener('pageshow', syncCartCount);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once:true })
    : init();
})();