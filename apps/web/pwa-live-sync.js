(() => {
  'use strict';

  const STORAGE_KEY = 'ARABISK_PWA_SYNC_REVISION_V1';
  const INTERVAL_MS = 15000;
  const SAFE_RELOAD_PATHS = new Set(['/', '/menu', '/offers', '/events', '/memories', '/profile']);
  let timer = 0;
  let busy = false;

  const path = () => location.pathname.replace(/\/$/, '') || '/';

  const isSafeToRefresh = () => {
    if (!SAFE_RELOAD_PATHS.has(path())) return false;
    if (document.visibilityState !== 'visible') return false;
    if (document.querySelector('.modal.show,[aria-modal="true"]')) return false;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || active?.isContentEditable) return false;
    try {
      const status = window.ARABISK_SHAMS?.status?.();
      if (status?.listening || status?.speaking || status?.busy || status?.conversationActive) return false;
    } catch {}
    return true;
  };

  const readRevision = () => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  };

  const writeRevision = value => {
    try { localStorage.setItem(STORAGE_KEY, String(value || '')); } catch {}
  };

  const fetchSnapshot = async () => {
    const response = await fetch('/api/pwa/sync', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('PWA sync failed');
    return response.json();
  };

  async function sync({ initial = false } = {}) {
    if (busy || navigator.onLine === false) return;
    busy = true;
    try {
      const snapshot = await fetchSnapshot();
      const revisions = snapshot?.revisions || {};
      const fingerprint = JSON.stringify(revisions);
      const previous = readRevision();
      writeRevision(fingerprint);

      if (!initial && previous && previous !== fingerprint) {
        window.dispatchEvent(new CustomEvent('arabisk:pwa-sync', {
          detail: { version: snapshot?.version || 1, revisions }
        }));
        if (isSafeToRefresh()) {
          window.setTimeout(() => window.location.reload(), 250);
        }
      }
    } catch {}
    finally {
      busy = false;
    }
  }

  const start = () => {
    window.clearInterval(timer);
    void sync({ initial: !readRevision() });
    timer = window.setInterval(() => void sync(), INTERVAL_MS);
  };

  window.ARABISK_PWA_SYNC = {
    refresh: () => sync(),
    getRevision: readRevision
  };

  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
  window.addEventListener('pageshow', () => void sync());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
