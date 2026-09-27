let deferredInstallPrompt = null;
let installOffer = null;
const INSTALL_DISMISS_KEY = 'ARABISK_PWA_INSTALL_DISMISSED';
const REWARD_CODE_KEY = 'ARABISK_INSTALL_REWARD_CODE';
const CLIENT_ID_KEY = 'ARABISK_PWA_CLIENT_ID';

function isIosSafari() {
  const ua = navigator.userAgent || '';
  const iosDevice = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariBrowser = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iosDevice && safariBrowser;
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function getClientId() {
  try {
    let value = localStorage.getItem(CLIENT_ID_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || ('pwa-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(CLIENT_ID_KEY, value);
    }
    return value.slice(0, 100);
  } catch {
    return '';
  }
}

async function fetchInstallOffer() {
  try {
    const response = await fetch('/api/promotions/install', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    installOffer = data?.enabled ? data : null;
    return installOffer;
  } catch {
    return null;
  }
}

function ensurePwaUi() {
  if (document.getElementById('pwa-install')) return;
  const style = document.createElement('style');
  style.textContent = '.pwa-install{position:fixed;right:16px;left:16px;bottom:16px;z-index:10000;display:flex;align-items:center;gap:12px;padding:13px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-install[hidden],.pwa-reward[hidden]{display:none}.pwa-install-copy{flex:1}.pwa-install-copy strong{display:block;color:#d2b16d;margin-bottom:2px}.pwa-install-copy span{display:block;color:rgba(255,255,255,.8);font-size:11px}.pwa-install button{border:0;border-radius:999px;padding:9px 14px;background:#b89455;color:#fff;font:inherit;cursor:pointer}.pwa-install .pwa-dismiss{padding:8px 10px;background:transparent;border:1px solid #5b4a34}.pwa-reward{position:fixed;right:16px;left:16px;bottom:16px;z-index:10001;display:flex;align-items:center;gap:12px;padding:13px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-reward-copy{flex:1}.pwa-reward-copy strong{display:block;color:#d2b16d}.pwa-reward-code{display:inline-block;margin-top:5px;padding:5px 9px;border-radius:8px;background:#0f0e0c;letter-spacing:1px;font-weight:800}.pwa-reward a{border:0;border-radius:999px;padding:9px 13px;background:#b89455;color:#fff;font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}.pwa-update{position:fixed;right:16px;left:16px;bottom:16px;z-index:10002;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-update button{margin-inline-start:auto;border:0;border-radius:999px;padding:9px 14px;background:#b89455;color:#fff;font:inherit;cursor:pointer}@media(max-width:800px){.pwa-install,.pwa-reward,.pwa-update{bottom:calc(88px + env(safe-area-inset-bottom));right:12px;left:12px;flex-wrap:wrap}}';
  document.head.appendChild(style);

  const banner = document.createElement('aside');
  banner.id = 'pwa-install';
  banner.className = 'pwa-install';
  banner.hidden = true;
  const discount = Number(installOffer?.discountValue || 10);
  banner.innerHTML = '<div class="pwa-install-copy"><strong>ثبّت ARABISK واحصل على خصم ' + discount + '%</strong><span>' + (installOffer?.message || 'ثبّت ARABISK على شاشتك الرئيسية وخذ خصمك على أول طلب.') + '</span></div><button type="button" data-install>تثبيت</button><button type="button" class="pwa-dismiss" data-dismiss aria-label="إغلاق">×</button>';
  document.body.appendChild(banner);

  banner.querySelector('[data-install]')?.addEventListener('click', async () => {
    if (isIosSafari()) {
      banner.querySelector('.pwa-install-copy span').textContent = 'في Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية». بعد فتح ARABISK من الشاشة الرئيسية سيظهر كود الخصم.';
      return;
    }
    if (!deferredInstallPrompt) {
      banner.querySelector('.pwa-install-copy span').textContent = 'افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') {
      banner.querySelector('.pwa-install-copy span').textContent = 'تم طلب التثبيت. بعد اكتماله سيظهر لك كود الخصم.';
    }
    deferredInstallPrompt = null;
  });

  banner.querySelector('[data-dismiss]')?.addEventListener('click', () => {
    banner.hidden = true;
    try { sessionStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch {}
  });
}

function showInstallBanner() {
  if (!installOffer || isStandaloneMode()) return;
  ensurePwaUi();
  const banner = document.getElementById('pwa-install');
  if (!banner) return;
  try {
    if (sessionStorage.getItem(INSTALL_DISMISS_KEY) === '1') return;
  } catch {}
  banner.hidden = false;
}

async function claimInstallReward() {
  if (!installOffer || !isStandaloneMode()) return;
  let existing = '';
  try { existing = localStorage.getItem(REWARD_CODE_KEY) || ''; } catch {}
  if (existing) {
    showReward(existing, installOffer);
    return;
  }
  try {
    const response = await fetch('/api/promotions/install/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientId() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.code) return;
    try { localStorage.setItem(REWARD_CODE_KEY, data.code); } catch {}
    showReward(data.code, { ...installOffer, ...data });
  } catch {}
}

function showReward(code, offer) {
  document.querySelector('.pwa-install')?.remove();
  if (document.querySelector('.pwa-reward')) return;
  const banner = document.createElement('aside');
  banner.className = 'pwa-reward';
  banner.innerHTML = '<div class="pwa-reward-copy"><strong>تم تفعيل خصم تثبيت ARABISK 🎁</strong><span>استخدم كودك الشخصي في السلة للحصول على خصم ' + Number(offer?.discountValue || 10) + '%.</span><div class="pwa-reward-code">' + String(code).replace(/</g, '&lt;') + '</div></div><a href="/cart?promo=' + encodeURIComponent(code) + '">استخدم الخصم</a>';
  document.body.appendChild(banner);
}

async function checkForPwaUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;
  try { await registration.update(); } catch {}
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!isStandaloneMode()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('pwa-install')?.remove();
  void claimInstallReward();
});

window.addEventListener('arabisk:pwa-update', () => {
  const existing = document.querySelector('.pwa-update');
  if (existing) return;
  const banner = document.createElement('aside');
  banner.className = 'pwa-update';
  banner.innerHTML = '<span>يتوفر تحديث جديد لـ ARABISK.</span><button type="button">تحديث الآن</button>';
  banner.querySelector('button')?.addEventListener('click', () => window.location.reload());
  document.body.appendChild(banner);
});

window.addEventListener('load', async () => {
  await fetchInstallOffer();
  if (isStandaloneMode()) {
    await claimInstallReward();
    return;
  }
  if (isIosSafari()) {
    showInstallBanner();
    return;
  }
  if (!deferredInstallPrompt && installOffer) {
    window.setTimeout(showInstallBanner, 900);
  }
});
window.addEventListener('online', checkForPwaUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForPwaUpdate();
});
