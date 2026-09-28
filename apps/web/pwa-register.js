function registerStandalonePwa() {
  if (!('serviceWorker' in navigator)) return;

  const refreshAfterActivation = () => {
    const startedAt = Date.now();
    const reloadWhenIdle = () => {
      const shamsBusy = Boolean(
        document.querySelector('#shams-launcher.is-listening, #shams-launcher.is-speaking, #shams-launcher.is-thinking')
      );
      if (!shamsBusy || Date.now() - startedAt > 15000) {
        window.location.reload();
        return;
      }
      window.setTimeout(reloadWhenIdle, 500);
    };
    reloadWhenIdle();
  };

  navigator.serviceWorker.addEventListener('controllerchange', refreshAfterActivation);

  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration('/').then((registration) => {
      if (registration) return registration.update();
    }).catch(() => {});
  };

  window.addEventListener('load', () => {
    checkForUpdate();
    window.setTimeout(checkForUpdate, 10000);
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
      })
      .catch((error) => console.error('ARABISK PWA registration error:', error));
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
  window.addEventListener('pageshow', checkForUpdate);
}

registerStandalonePwa();
