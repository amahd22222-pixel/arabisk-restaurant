(() => {
  let hasControllerAtStartup = Boolean(navigator.serviceWorker.controller);
  let reloadPending = false;
  let reloadTimer = null;
  let pageDirty = false;

  function shamsIsBusy() {
    try {
      const status = window.ARABISK_SHAMS?.status?.();
      return Boolean(status?.listening || status?.speaking || status?.busy || status?.conversationActive);
    } catch {
      return false;
    }
  }

  function pageHasUnsavedInput() {
    return pageDirty;
  }

  function markPageDirty(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('[data-pwa-ignore-dirty]')) return;
    if (!target.matches('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]')) return;
    pageDirty = true;
  }

  function markPageClean() {
    pageDirty = false;
  }

  function reloadWhenSafe() {
    if (!reloadPending) return;
    if (document.visibilityState === 'hidden' || (!shamsIsBusy() && !pageHasUnsavedInput())) {
      reloadPending = false;
      window.clearTimeout(reloadTimer);
      window.location.reload();
      return;
    }
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(reloadWhenSafe, 1500);
  }

  function attachControllerGuard() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hasControllerAtStartup) {
        hasControllerAtStartup = true;
        return;
      }
      reloadPending = true;
      reloadWhenSafe();
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

    document.addEventListener('input', markPageDirty, { capture: true });
    document.addEventListener('change', markPageDirty, { capture: true });
    document.addEventListener('submit', markPageClean, { capture: true });

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
        reloadWhenSafe();
      }
    });

    window.addEventListener('pageshow', () => {
      checkForUpdate();
      reloadWhenSafe();
    });

    window.addEventListener('pagehide', () => {
      if (reloadPending) reloadWhenSafe();
    });
  }

  registerStandalonePwa();
})();