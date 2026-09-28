(() => {
  'use strict';

  const FALLBACK_ATTR = 'data-pwa-media-fallback';
  const ORIGINAL_SRC_ATTR = 'data-pwa-media-original-src';
  const ORIGINAL_SRCSET_ATTR = 'data-pwa-media-original-srcset';
  const RETRY_AFTER_MS = 1400;
  let retryTimer = 0;

  const isMedia = element => element instanceof HTMLImageElement || element instanceof HTMLVideoElement;

  function rememberOriginal(element) {
    if (!element.hasAttribute(ORIGINAL_SRC_ATTR)) {
      const src = element.getAttribute('src');
      if (src) element.setAttribute(ORIGINAL_SRC_ATTR, src);
    }
    if (!element.hasAttribute(ORIGINAL_SRCSET_ATTR)) {
      const srcset = element.getAttribute('srcset');
      if (srcset) element.setAttribute(ORIGINAL_SRCSET_ATTR, srcset);
    }
  }

  function applyFallbackStyles(element) {
    element.style.backgroundImage = "radial-gradient(circle at 50% 42%, rgba(230,201,145,.22), rgba(23,19,15,.96) 64%), url('/icons/icon-192.png')";
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundPosition = 'center';
    element.style.backgroundSize = 'min(88px, 24%), cover';
    element.style.objectFit = 'contain';
  }

  function fallbackMedia(element) {
    if (!isMedia(element)) return;
    rememberOriginal(element);
    if (element.hasAttribute(FALLBACK_ATTR)) return;

    element.setAttribute(FALLBACK_ATTR, 'true');
    element.removeAttribute('srcset');
    element.removeAttribute('src');

    if (element instanceof HTMLVideoElement) {
      try { element.pause(); element.load(); } catch {}
    }

    applyFallbackStyles(element);
    element.setAttribute('aria-label', element.getAttribute('alt') || 'ARABISK');
  }

  function restoreMedia(element) {
    if (!isMedia(element) || !element.hasAttribute(FALLBACK_ATTR)) return false;
    const src = element.getAttribute(ORIGINAL_SRC_ATTR);
    const srcset = element.getAttribute(ORIGINAL_SRCSET_ATTR);

    element.removeAttribute(FALLBACK_ATTR);
    element.style.backgroundImage = '';
    element.style.backgroundRepeat = '';
    element.style.backgroundPosition = '';
    element.style.backgroundSize = '';
    element.style.objectFit = '';

    if (srcset) element.setAttribute('srcset', srcset);
    if (src) element.setAttribute('src', src);

    if (element instanceof HTMLVideoElement) {
      try { element.load(); } catch {}
    }
    return Boolean(src || srcset);
  }

  function retryFallbackMedia() {
    if (navigator.onLine === false) return;
    const candidates = [...document.querySelectorAll(`[${FALLBACK_ATTR}]`)].filter(isMedia);
    for (const element of candidates) {
      restoreMedia(element);
    }
  }

  function scheduleRetry() {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(retryFallbackMedia, RETRY_AFTER_MS);
  }

  document.addEventListener('error', event => {
    fallbackMedia(event.target);
  }, true);

  window.addEventListener('online', scheduleRetry);
  window.addEventListener('pageshow', scheduleRetry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleRetry();
  });

  window.ARABISK_PWA_MEDIA = {
    fallback: fallbackMedia,
    retry: retryFallbackMedia
  };
})();