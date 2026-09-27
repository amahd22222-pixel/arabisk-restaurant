let deferredInstallPrompt = null;

function isIosSafari() {
  const ua = navigator.userAgent || '';
  const iosDevice = /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariBrowser = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iosDevice && safariBrowser;
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function ensurePwaUi() {
  if (document.getElementById('pwa-install')) return;
  const style = document.createElement('style');
  style.textContent = '.pwa-install{position:fixed;right:16px;left:16px;bottom:16px;z-index:1000;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-install[hidden]{display:none}.pwa-install-copy{flex:1}.pwa-install-copy strong{display:block;color:#d2b16d}.pwa-install button{border:0;border-radius:999px;padding:9px 14px;background:#b89455;color:#fff;font:inherit;cursor:pointer}.pwa-install .pwa-dismiss{padding:8px 10px;background:transparent;border:1px solid #5b4a34}.pwa-update{position:fixed;right:16px;left:16px;bottom:16px;z-index:10001;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#17130f;color:#fff;border:1px solid rgba(210,177,109,.35);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28);font:13px/1.5 Cairo,sans-serif}.pwa-update button{margin-inline-start:auto;border:0;border-radius:999px;padding:9px 14px;background:#b89455;color:#fff;font:inherit;cursor:pointer}';
  style.textContent += '@media (max-width:800px){.pwa-install,.pwa-update{bottom:calc(88px + env(safe-area-inset-bottom))}}';  document.head.appendChild(style);

  const banner = document.createElement('aside');
  banner.id = 'pwa-install';
  banner.className = 'pwa-install';
  banner.hidden = true;
  banner.innerHTML = '<div class="pwa-install-copy"><strong>ثبّت ARABISK كتطبيق</strong><span>وصول أسرع وتجربة أفضل من الشاشة الرئيسية.</span></div><button type="button" data-install>تثبيت</button><button type="button" class="pwa-dismiss" data-dismiss aria-label="إغلاق">×</button>';
  document.body.appendChild(banner);

  banner.querySelector('[data-install]')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    banner.hidden = true;
  });
  banner.querySelector('[data-ios-install]')?.addEventListener('click', () => {
    banner.querySelector('.pwa-install-copy span').textContent =
      'في Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».';
  });
  banner.querySelector('[data-dismiss]')?.addEventListener('click', () => {
    banner.hidden = true;
    sessionStorage.setItem('ARABISK_PWA_INSTALL_DISMISSED', '1');
  });
}

async function checkForPwaUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;
  try {
    await registration.update();
  } catch {
    // A transient network failure must not affect the restaurant experience.
  }
}

function showIosInstallHint() {
  if (!isIosSafari() || isStandaloneMode()) return;
  if (sessionStorage.getItem('ARABISK_PWA_INSTALL_DISMISSED') === '1') return;
  ensurePwaUi();
  const banner = document.getElementById('pwa-install');
  if (!banner) return;
  const installButton = banner.querySelector('[data-install]');
  if (installButton) {
    installButton.removeAttribute('data-install');
    installButton.setAttribute('data-ios-install', '');
    installButton.textContent = 'طريقة التثبيت';
  }
  banner.querySelector('.pwa-install-copy span').textContent =
    'في iPhone وiPad: استخدم زر مشاركة في Safari لإضافة ARABISK إلى الشاشة الرئيسية.';
  banner.hidden = false;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ensurePwaUi();
  if (sessionStorage.getItem('ARABISK_PWA_INSTALL_DISMISSED') !== '1') {
    document.getElementById('pwa-install').hidden = false;
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('pwa-install')?.remove();
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

window.addEventListener('load', () => {
  if (!deferredInstallPrompt) showIosInstallHint();
});
window.addEventListener('online', checkForPwaUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForPwaUpdate();
});
