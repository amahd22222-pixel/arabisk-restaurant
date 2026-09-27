const DISMISS_KEY = 'ARABISK_PUSH_PERMISSION_DISMISSED_AT';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function supportsPush() {
  return isStandaloneMode() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function base64UrlToUint8Array(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function getRegistration() {
  return navigator.serviceWorker.getRegistration('/') ||
    navigator.serviceWorker.ready;
}

async function syncSubscription(subscription) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      contextTag: 'installed-pwa'
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('تعذر تسجيل إشعارات ARABISK.');
}

async function subscribeToPush() {
  if (!supportsPush()) return false;
  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const keyResponse = await fetch('/api/push/public-key', { cache: 'no-store' });
    if (!keyResponse.ok) return false;
    const data = await keyResponse.json();
    if (!data?.publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(data.publicKey)
    });
  }
  await syncSubscription(subscription);
  return true;
}

function dismissedRecently() {
  try {
    const stamp = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(stamp) && Date.now() - stamp < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

function mountPermissionPrompt() {
  if (!supportsPush() || Notification.permission !== 'default' || dismissedRecently()) return;
  if (document.getElementById('arabisk-push-permission')) return;

  const style = document.createElement('style');
  style.textContent = '.arabisk-push-permission{position:fixed;right:12px;left:12px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:10001;display:flex;align-items:center;gap:12px;padding:14px;border:1px solid rgba(210,177,109,.28);border-radius:20px;background:#17130f;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.34);font:12px/1.6 Cairo,sans-serif}.arabisk-push-permission-copy{flex:1}.arabisk-push-permission-copy strong{display:block;color:#d2b16d;font-size:13px}.arabisk-push-permission-copy span{display:block;color:rgba(255,255,255,.72);font-size:10px}.arabisk-push-permission button{border:0;border-radius:999px;padding:10px 13px;background:#b89455;color:#fff;font:800 10px Cairo,sans-serif;white-space:nowrap}.arabisk-push-permission button[data-dismiss]{background:transparent;border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.65)}@media(max-width:380px){.arabisk-push-permission{align-items:flex-start;flex-wrap:wrap}.arabisk-push-permission-copy{width:100%}.arabisk-push-permission button{flex:1}}';
  document.head.appendChild(style);

  const banner = document.createElement('aside');
  banner.id = 'arabisk-push-permission';
  banner.className = 'arabisk-push-permission';
  banner.innerHTML = '<div class="arabisk-push-permission-copy"><strong>فعّل إشعارات ARABISK 🔔</strong><span>اعرف الفعاليات والعروض والتحديثات حتى لو التطبيق مقفول.</span></div><button type="button" data-enable>تفعيل الإشعارات</button><button type="button" data-dismiss>ليس الآن</button>';
  document.body.appendChild(banner);

  banner.querySelector('[data-enable]')?.addEventListener('click', async () => {
    const button = banner.querySelector('[data-enable]');
    if (button) button.disabled = true;
    try {
      const ok = await subscribeToPush();
      if (ok) {
        banner.remove();
      } else {
        banner.querySelector('span').textContent = 'لم يتم تفعيل الإشعارات. يمكنك تفعيلها من إعدادات هاتفك ثم المحاولة مرة أخرى.';
      }
    } catch {
      banner.querySelector('span').textContent = 'تعذر تفعيل الإشعارات الآن. حاول مرة أخرى من داخل التطبيق.';
    } finally {
      if (button) button.disabled = false;
    }
  });

  banner.querySelector('[data-dismiss]')?.addEventListener('click', () => {
    rememberDismissal();
    banner.remove();
  });
}

async function bootstrapPush() {
  if (!supportsPush()) return;
  try {
    if (Notification.permission === 'granted') {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await syncSubscription(subscription);
      return;
    }
  } catch {}

  mountPermissionPrompt();
}

window.addEventListener('load', () => {
  void bootstrapPush();
});
window.addEventListener('appinstalled', () => {
  window.setTimeout(() => void bootstrapPush(), 1200);
});
