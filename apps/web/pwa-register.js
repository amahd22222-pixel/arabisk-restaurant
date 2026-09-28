(() => {
  const UPDATE_RELOAD_KEY = 'ARABISK_PWA_UPDATE_RELOADED_V2';

  function shouldReloadForUpdate() {
    try {
      return sessionStorage.getItem(UPDATE_RELOAD_KEY) !== '1';
    } catch {
      return true;
    }
  }

  function markReloaded() {
    try { sessionStorage.setItem(UPDATE_RELOAD_KEY, '1'); } catch {}
  }

  function attachControllerGuard() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!shouldReloadForUpdate()) return;
      markReloaded();
      window.location.reload();
    });
  }

  function checkForUpdate() {
    navigator.serviceWorker.getRegistration('/').then((registration) => {
      if (registration) return registration.update();
    }).catch(() => {});
  }

  function registerStandalonePwa() {
    if (!('serviceWorker' in navigator)) return;

    attachControllerGuard();

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          registration.update().catch(() => {});

          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                window.dispatchEvent(new CustomEvent('arabisk:pwa-update'));
              }
            });
          });

          window.setTimeout(checkForUpdate, 10000);
        })
        .catch((error) => console.error('ARABISK PWA registration error:', error));
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        try { sessionStorage.removeItem(UPDATE_RELOAD_KEY); } catch {}
        checkForUpdate();
      }
    });

    window.addEventListener('pageshow', () => {
      try { sessionStorage.removeItem(UPDATE_RELOAD_KEY); } catch {}
      checkForUpdate();
    });
  }

  registerStandalonePwa();
})();