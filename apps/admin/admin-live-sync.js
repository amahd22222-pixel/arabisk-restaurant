(() => {
'use strict';

const INTERVAL_MS = 12000;
let timer = null;
let running = false;

async function refresh() {
  if (running) return;
  if (!navigator.onLine) return;
  if (document.hidden) return;
  const reload = window.ARABISK_ADMIN_RELOAD;
  if (typeof reload !== 'function') return;
  running = true;
  try {
    await reload({ reason: 'background-sync' });
  } catch {}
  finally {
    running = false;
  }
}

function start() {
  if (timer) clearInterval(timer);
  window.setTimeout(refresh, 3000);
  timer = window.setInterval(refresh, INTERVAL_MS);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('beforeunload', () => {
    if (timer) clearInterval(timer);
  });
}

start();
})();