(() => {
  const UPDATE_RELOAD_KEY = 'ARABISK_PWA_UPDATE_RELOADED_V2';

  let hasControllerAtStartup = Boolean(navigator.serviceWorker.controller);

  function attachControllerGuard() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hasControllerAtStartup) {
        hasControllerAtStartup = true;
        return;
      }
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
        checkForUpdate();
      }
    });

    window.addEventListener('pageshow', () => {
      checkForUpdate();
    });
  }

  registerStandalonePwa();
})();