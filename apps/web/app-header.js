// Shared ARABISK app-header behavior for inner pages (menu/category/product/cart/events/etc.).
// Pages that already load app.js (index.html, menu.html) handle this themselves and do not include this file.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  function markActiveLink() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('#app-header-nav a').forEach(link => {
      const href = (link.getAttribute('href') || '').replace(/\/$/, '') || '/';
      const isActive = href === path || (href !== '/' && path.startsWith(href));
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setupHeaderMenu() {
  const button = $('#app-menu-button');
  const nav = $('#app-header-nav');
  if (!button || !nav || button.dataset.menuBound === 'true') return;

  const isMobile = () => window.matchMedia('(max-width:800px)').matches;
  const setOpen = open => {
    const value = Boolean(open);
    nav.classList.toggle('is-open', value);
    button.setAttribute('aria-expanded', String(value));
    button.setAttribute('aria-label', value ? 'إغلاق القائمة' : 'فتح القائمة');
    button.textContent = value ? '×' : '☰';
    document.body.classList.toggle('app-nav-open', value && isMobile());
  };

  button.dataset.menuBound = 'true';
  setOpen(false);

  button.addEventListener('click', event => {
    event.preventDefault();
    setOpen(!nav.classList.contains('is-open'));
  });

  nav.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('click', event => {
    if (!nav.classList.contains('is-open')) return;
    if (button.contains(event.target) || nav.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
  });

  window.addEventListener('resize', () => {
    if (!isMobile() && nav.classList.contains('is-open')) setOpen(false);
    else if (nav.classList.contains('is-open')) document.body.classList.add('app-nav-open');
  }, { passive: true });

  window.addEventListener('pageshow', () => setOpen(false), { passive: true });
}

  function setupLanguageToggle() {
    const toggle = $('#lang-toggle');
    if (!toggle) return;

    let language = localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar';

    const apply = () => {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      toggle.textContent = language === 'ar' ? 'EN' : 'ع';
      window.dispatchEvent(new CustomEvent('arabisk:language-updated', { detail: { language } }));
    };

    apply();
    toggle.addEventListener('click', () => {
      language = language === 'ar' ? 'en' : 'ar';
      localStorage.setItem('ARABISK_LANG', language);
      apply();
    });
  }

  function init() {
    setupHeaderMenu();
    setupLanguageToggle();
    markActiveLink();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
