(() => {
  'use strict';

  const ID = 'arabisk-network-status';
  let hideTimer = 0;

  function ensureStatus() {
    let node = document.getElementById(ID);
    if (node) return node;

    const style = document.createElement('style');
    style.dataset.arabiskNetwork = 'true';
    style.textContent = [
      '#arabisk-network-status{position:fixed;right:12px;left:12px;top:10px;z-index:10004;display:flex;align-items:center;justify-content:center;gap:9px;padding:10px 14px;border:1px solid rgba(197,154,91,.26);border-radius:999px;background:rgba(23,19,15,.96);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.2);font:800 11px/1.4 Cairo,sans-serif;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transform:translateY(-140%);opacity:0;pointer-events:none;transition:transform .24s ease,opacity .24s ease}',
      '#arabisk-network-status.is-visible{transform:translateY(0);opacity:1}',
      '#arabisk-network-status[data-state="offline"]{border-color:rgba(190,116,84,.35)}',
      '#arabisk-network-status[data-state="online"]{border-color:rgba(82,145,103,.35)}',
      '#arabisk-network-status .dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#bd7654}',
      '#arabisk-network-status[data-state="online"] .dot{background:#62a778}',
      '@media(max-width:520px){#arabisk-network-status{top:8px;font-size:10px;padding:9px 12px}}',
      '@media(prefers-reduced-motion:reduce){#arabisk-network-status{transition:none}}'
    ].join('\n');
    document.head.appendChild(style);

    node = document.createElement('div');
    node.id = ID;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = '<span class="dot" aria-hidden="true"></span><span data-copy></span>';
    document.body.appendChild(node);
    return node;
  }

  function show(state, message, autoHide = false) {
    const node = ensureStatus();
    window.clearTimeout(hideTimer);
    node.dataset.state = state;
    node.querySelector('[data-copy]').textContent = message;
    node.classList.add('is-visible');
    if (autoHide) {
      hideTimer = window.setTimeout(() => node.classList.remove('is-visible'), 3200);
    }
  }

  function sync(initial = false) {
    if (navigator.onLine) {
      if (!initial) show('online', 'تم استعادة الاتصال بالإنترنت.', true);
    } else {
      show('offline', 'أنت الآن دون اتصال — سيستخدم ARABISK البيانات المحفوظة.', false);
    }
    window.dispatchEvent(new CustomEvent('arabisk:network-state', {
      detail: { online: navigator.onLine }
    }));
  }

  window.addEventListener('offline', () => sync(false));
  window.addEventListener('online', () => sync(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !navigator.onLine) sync(false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sync(true), { once: true });
  } else {
    sync(true);
  }
})();