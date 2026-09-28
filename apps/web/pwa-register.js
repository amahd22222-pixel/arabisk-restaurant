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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
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
}

registerStandalonePwa();
