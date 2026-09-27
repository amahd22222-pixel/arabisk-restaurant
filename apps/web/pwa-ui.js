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
  style.textContent = '.pwa-install{position:fixed;right:16px;left:16px;bottom:20px;z-index:10000;display:grid;grid-template-columns:76px 1fr auto;align-items:center;gap:14px;padding:16px 17px;background:linear-gradient(145deg,#1b1712,#0f0d0a);color:#fff;border:1px solid rgba(210,177,109,.28);border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.03) inset;font:13px/1.5 Cairo,sans-serif;overflow:hidden}.pwa-install:before{content:"";position:absolute;inset:-40% auto auto -10%;width:180px;height:180px;border-radius:50%;background:rgba(210,177,109,.11);filter:blur(8px)}.pwa-install[hidden],.pwa-reward[hidden]{display:none}.pwa-install-mark{position:relative;display:grid;place-items:center;width:76px;height:76px;border:1px solid rgba(210,177,109,.38);border-radius:20px;background:rgba(210,177,109,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}.pwa-install-mark span{font:900 34px/1 "Playfair Display",serif;color:#fff}.pwa-install-mark small{margin-top:-18px;color:#d2b16d;font:800 12px/1 Cairo,sans-serif}.pwa-install-copy{position:relative;min-width:0}.pwa-install-kicker{display:block;margin-bottom:3px;color:#d2b16d;font:800 9px/1 Cairo,sans-serif;letter-spacing:1.6px}.pwa-install-copy strong{display:block;margin-bottom:4px;color:#fff;font:800 16px/1.35 Cairo,sans-serif}.pwa-install-copy span{display:block;color:rgba(255,255,255,.68);font-size:11px;line-height:1.8}.pwa-install-actions{position:relative;display:grid;gap:7px;min-width:126px}.pwa-install button{border:0;border-radius:999px;padding:10px 15px;background:#b89455;color:#fff;font:800 11px/1.2 Cairo,sans-serif;cursor:pointer;white-space:nowrap}.pwa-install .pwa-dismiss{padding:7px 10px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.66);font-size:10px}.pwa-reward{position:fixed;right:16px;left:16px;bottom:20px;z-index:10001;display:flex;align-items:center;gap:12px;padding:15px 16px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.32);font:13px/1.5 Cairo,sans-serif}.pwa-reward-copy{flex:1}.pwa-reward-copy strong{display:block;color:#d2b16d}.pwa-reward-code{display:inline-block;margin-top:5px;padding:5px 9px;border-radius:8px;background:#0f0e0c;letter-spacing:1px;font-weight:800}.pwa-reward a{border:0;border-radius:999px;padding:9px 13px;background:#b89455;color:#fff;font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}.pwa-update{position:fixed;right:16px;left:16px;bottom:20px;z-index:10002;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-update button{margin-inline-start:auto;border:0;border-radius:999px;padding:9px 14px;background:#b89455;color:#fff;font:inherit;cursor:pointer}@media(max-width:800px){.pwa-install{right:10px;left:10px;bottom:calc(88px + env(safe-area-inset-bottom));grid-template-columns:58px 1fr;gap:12px;padding:13px;border-radius:22px}.pwa-install-mark{width:58px;height:58px;border-radius:17px}.pwa-install-mark span{font-size:26px}.pwa-install-mark small{margin-top:-13px;font-size:10px}.pwa-install-copy strong{font-size:14px}.pwa-install-copy span{font-size:10px}.pwa-install-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:8px;min-width:0}.pwa-install button{min-height:42px}.pwa-install .pwa-dismiss{padding-inline:13px}.pwa-reward,.pwa-update{bottom:calc(88px + env(safe-area-inset-bottom));right:12px;left:12px;flex-wrap:wrap}}@media(max-width:380px){.pwa-install{grid-template-columns:52px 1fr;padding:11px}.pwa-install-mark{width:52px;height:52px}.pwa-install-copy span{line-height:1.65}.pwa-install-actions{grid-template-columns:1fr}.pwa-install .pwa-dismiss{display:none}}'
  document.head.appendChild(style);

  const banner = document.createElement('aside');
  banner.id = 'pwa-install';
  banner.className = 'pwa-install';
  banner.hidden = true;
  const discount = Number(installOffer?.discountValue || 20);
  const title = String(installOffer?.title || 'خلّي ARABISK أقرب إليك').replace(/[<>&"]/g, '');
  const message = String(installOffer?.message || 'ثبّت تطبيق ARABISK واستمتع بتجربة أسرع للمنيو، الحجز والسلة — ومع التثبيت تحصل على خصم 20%.').replace(/[<>&]/g, '');
  banner.innerHTML = '<div class="pwa-install-mark" aria-hidden="true"><span>20</span><small>%</small></div><div class="pwa-install-copy"><small class="pwa-install-kicker">ARABISK PASS</small><strong>' + title + '</strong><span>' + message + '</span></div><div class="pwa-install-actions"><button type="button" data-install>ثبّت ARABISK</button><button type="button" class="pwa-dismiss" data-dismiss aria-label="ليس الآن">ليس الآن</button></div>';
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
  banner.innerHTML = '<div class="pwa-reward-copy"><strong>تم تفعيل خصم تثبيت ARABISK 🎁</strong><span>استخدم كودك الشخصي في السلة للحصول على خصم ' + Number(offer?.discountValue || 20) + '%.</span><div class="pwa-reward-code">' + String(code).replace(/</g, '&lt;') + '</div></div><a href="/cart?promo=' + encodeURIComponent(code) + '">استخدم الخصم</a>';
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
