const API = window.__ARABISK_API_BASE__ || 'https://web-production-d41a3.up.railway.app';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[char]));
const langIsEnglish = () => document.documentElement.lang.toLowerCase().startsWith('en');

async function fetchBanners(placement) {
  try {
    const response = await fetch(`${API}/api/banners?placement=${encodeURIComponent(placement)}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const items = await response.json();
    return Array.isArray(items) ? items.filter((item) => item.active).sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0)) : [];
  } catch { return []; }
}

async function fetchBannerVideos(items) {
  const results = new Map();
  await Promise.all(items.map(async (item) => {
    try {
      const response = await fetch(`${API}/api/banners/${encodeURIComponent(item.id)}/video`, { cache: 'no-store' });
      if (response.ok) results.set(item.id, await response.json());
    } catch {}
  }));
  return results;
}

function pick(item, ar, en) {
  return langIsEnglish() ? (item[en] || item[ar] || '') : (item[ar] || item[en] || '');
}

function mediaMarkup(item, video) {
  const image = item.imageUrl || item.mobileImageUrl || '';
  if (video?.active && video.videoUrl) {
    return `<video class="managed-banner-video" autoplay muted loop playsinline preload="metadata" poster="${escapeHtml(image)}"><source src="${escapeHtml(video.videoUrl)}"></video>`;
  }
  return `<div class="managed-banner-image" style="background-image:linear-gradient(90deg,rgba(7,7,7,.78),rgba(7,7,7,.25) 58%,rgba(7,7,7,.06)),url(${JSON.stringify(image)})"></div>`;
}

function renderHomeHero(items, videos) {
  const hero = document.querySelector('#home.hero');
  if (!hero || !items.length) return;
  let index = 0;
  hero.classList.add('managed-banner-hero');
  hero.innerHTML = `<div class="managed-banner-stage"></div><div class="managed-banner-arrows"><button type="button" class="managed-banner-arrow prev" aria-label="Previous">‹</button><button type="button" class="managed-banner-arrow next" aria-label="Next">›</button></div><div class="managed-banner-dots" aria-label="Banner navigation"></div>`;
  const stage = hero.querySelector('.managed-banner-stage');
  const dots = hero.querySelector('.managed-banner-dots');
  const render = () => {
    const item = items[index];
    const title = pick(item,'titleAr','titleEn');
    const subtitle = pick(item,'subtitleAr','subtitleEn');
    const button = pick(item,'buttonTextAr','buttonTextEn');
    const href = item.link || '#menu';
    stage.innerHTML = `<div class="managed-banner-slide">${mediaMarkup(item, videos.get(item.id))}<div class="managed-banner-copy"><p class="eyebrow">ARABISK</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="lead">${escapeHtml(subtitle)}</p>` : ''}${button ? `<a class="gold-btn" href="${escapeHtml(href)}">${escapeHtml(button)}</a>` : ''}</div></div>`;
    dots.innerHTML = items.map((_, dotIndex) => `<button type="button" class="managed-banner-dot ${dotIndex===index?'active':''}" data-index="${dotIndex}" aria-label="Banner ${dotIndex+1}"></button>`).join('');
    dots.querySelectorAll('button').forEach((buttonEl) => buttonEl.addEventListener('click', () => { index = Number(buttonEl.dataset.index); render(); restart(); }));
  };
  let timer = null;
  const next = () => { index = (index + 1) % items.length; render(); };
  const prev = () => { index = (index - 1 + items.length) % items.length; render(); };
  const restart = () => { clearInterval(timer); if (items.length > 1) timer = setInterval(next, 6500); };
  hero.querySelector('.next').addEventListener('click', () => { next(); restart(); });
  hero.querySelector('.prev').addEventListener('click', () => { prev(); restart(); });
  render();
  restart();
}

async function injectPromo(placement, selector, className) {
  const items = await fetchBanners(placement);
  if (!items.length) return;
  const anchor = document.querySelector(selector);
  if (!anchor || document.querySelector(`.${className}`)) return;
  const videos = await fetchBannerVideos(items);
  const item = items[0];
  const title = pick(item,'titleAr','titleEn');
  const subtitle = pick(item,'subtitleAr','subtitleEn');
  const button = pick(item,'buttonTextAr','buttonTextEn');
  const href = item.link || '#menu';
  const card = document.createElement('section');
  card.className = className;
  card.innerHTML = `${mediaMarkup(item, videos.get(item.id))}<div class="managed-promo-copy"><p class="eyebrow">ARABISK</p><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}${button ? `<a class="gold-btn" href="${escapeHtml(href)}">${escapeHtml(button)}</a>` : ''}</div>`;
  anchor.insertAdjacentElement('beforebegin', card);
}

document.addEventListener('DOMContentLoaded', async () => {
  const hero = await fetchBanners('home-hero');
  const heroVideos = await fetchBannerVideos(hero);
  renderHomeHero(hero, heroVideos);
  await injectPromo('home-promo', '#menu', 'managed-home-promo');
  await injectPromo('menu-top', '#menu-heading', 'managed-menu-promo');
  await injectPromo('footer-promo', 'footer', 'managed-footer-promo');
});
