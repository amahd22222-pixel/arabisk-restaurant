(() => {
  'use strict';

  const FALLBACK_ATTR = 'data-pwa-media-fallback';

  function fallbackMedia(element) {
    if (!(element instanceof HTMLImageElement || element instanceof HTMLVideoElement)) return;
    if (element.hasAttribute(FALLBACK_ATTR)) return;
    element.setAttribute(FALLBACK_ATTR, 'true');
    element.removeAttribute('srcset');
    element.removeAttribute('src');
    if (element instanceof HTMLVideoElement) {
      try { element.pause(); element.load(); } catch {}
    }
    element.style.backgroundImage = "radial-gradient(circle at 50% 42%, rgba(230,201,145,.22), rgba(23,19,15,.96) 64%), url('/icons/icon-192.png')";
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundPosition = 'center';
    element.style.backgroundSize = 'min(88px, 24%), cover';
    element.style.objectFit = 'contain';
    element.setAttribute('aria-label', element.getAttribute('alt') || 'ARABISK');
  }

  document.addEventListener('error', event => {
    fallbackMedia(event.target);
  }, true);

  window.ARABISK_PWA_MEDIA = { fallback: fallbackMedia };
})();