// Shared ARABISK app-header behavior for inner pages (menu/category/product/cart/events/etc.).
// Pages that already load app.js (index.html, menu.html) handle this themselves and do not include this file.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);

  function loadMobileAppNav() {
    if (!document.querySelector('link[data-arabisk-mobile-nav]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/mobile-nav.css';
      link.dataset.arabiskMobileNav = 'true';
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-arabisk-mobile-nav]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/mobile-nav.js';
      script.dataset.arabiskMobileNav = 'true';
      document.body.appendChild(script);
    }
  }

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
    if (!button || !nav) return;

    button.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? '×' : '☰';
    });
    nav.addEventListener('click', () => {
      nav.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = '☰';
    });
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
    loadMobileAppNav();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
