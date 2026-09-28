function registerStandalonePwa() {
  if (!('serviceWorker' in navigator)) return;

  const refreshOnce = () => {
    try {
      if (sessionStorage.getItem('ARABISK_PWA_REFRESHED_V1') === '1') return;
      sessionStorage.setItem('ARABISK_PWA_REFRESHED_V1', '1');
    } catch {}
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', refreshOnce, { once: true });

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
