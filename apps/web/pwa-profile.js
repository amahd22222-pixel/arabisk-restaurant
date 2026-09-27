(() => {
'use strict';

const PROFILE_TOKEN_KEY = 'ARABISK_PROFILE_TOKEN_V1';
const PROFILE_DATA_KEY = 'ARABISK_PROFILE_DATA_V1';
const DEVICE_ID_KEY = 'ARABISK_DEVICE_ID_V1';

const getJson = (key, fallback = null) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const saveJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

function getDeviceId() {
  try {
    let value = localStorage.getItem(DEVICE_ID_KEY);
    if (!value) {
      value = crypto.randomUUID?.() || ('device-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_ID_KEY, value);
    }
    return value;
  } catch {
    return 'device-' + Date.now();
  }
}

function getToken() {
  try { return localStorage.getItem(PROFILE_TOKEN_KEY) || ''; } catch { return ''; }
}

function getProfile() {
  return getJson(PROFILE_DATA_KEY, null);
}

function setProfile(profile) {
  saveJson(PROFILE_DATA_KEY, profile);
  try { localStorage.setItem(PROFILE_TOKEN_KEY, String(profile?.profileToken || '')); } catch {}
  window.ARABISK_PROFILE = { getProfile, getToken, refresh };
  window.dispatchEvent(new CustomEvent('arabisk:profile-updated', { detail: { profile } }));
}

async function refresh() {
  const token = getToken();
  if (!token) return null;
  const response = await fetch('/api/customer-profile', {
    headers: { 'X-ARABISK-PROFILE-TOKEN': token },
    cache: 'no-store'
  });
  if (response.status === 401) {
    try {
      localStorage.removeItem(PROFILE_TOKEN_KEY);
      localStorage.removeItem(PROFILE_DATA_KEY);
    } catch {}
    return null;
  }
  if (!response.ok) throw new Error('تعذر تحميل حسابك الآن.');
  const profile = await response.json();
  setProfile({ ...profile, profileToken: token });
  return profile;
}

function injectStyles() {
  if (document.getElementById('arabisk-profile-style')) return;
  const style = document.createElement('style');
  style.id = 'arabisk-profile-style';
  style.textContent = `
    .arabisk-profile-overlay{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(7,6,5,.76);backdrop-filter:blur(12px);font-family:Cairo,sans-serif}
    .arabisk-profile-card{width:min(460px,100%);padding:26px;border:1px solid rgba(210,177,109,.25);border-radius:28px;background:linear-gradient(145deg,#1c1712,#0f0d0b);color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.45)}
    .arabisk-profile-mark{width:54px;height:54px;display:grid;place-items:center;margin-bottom:16px;border:1px solid rgba(210,177,109,.35);border-radius:18px;color:#d2b16d;font-family:Georgia,serif;font-size:25px}
    .arabisk-profile-card h2{margin:0 0 8px;font-size:25px;font-weight:800}
    .arabisk-profile-card p{margin:0 0 20px;color:rgba(255,255,255,.68);font-size:12px;line-height:1.9}
    .arabisk-profile-field{display:block;margin:0 0 13px}.arabisk-profile-field span{display:block;margin:0 0 7px;color:#d7d0c6;font-size:11px;font-weight:700}
    .arabisk-profile-field input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.11);border-radius:14px;padding:12px 13px;background:rgba(255,255,255,.055);color:#fff;outline:none;font:600 13px Cairo,sans-serif}
    .arabisk-profile-field input:focus{border-color:#b89455;box-shadow:0 0 0 3px rgba(184,148,85,.12)}
    .arabisk-profile-consent{display:flex;gap:9px;align-items:flex-start;margin:12px 0 18px;color:rgba(255,255,255,.66);font-size:10px;line-height:1.8}
    .arabisk-profile-consent input{margin-top:4px;accent-color:#b89455}.arabisk-profile-consent a{color:#d2b16d;text-decoration:underline}
    .arabisk-profile-submit{width:100%;border:0;border-radius:999px;padding:13px 16px;background:#b89455;color:#17130f;font:900 12px Cairo,sans-serif;cursor:pointer}
    .arabisk-profile-submit:disabled{opacity:.55;cursor:wait}
    .arabisk-profile-note{min-height:19px;margin-top:11px;color:#ffb7ad;font-size:10px;text-align:center}
    .arabisk-profile-disclaimer{margin-top:14px!important;margin-bottom:0!important;font-size:9px!important;color:rgba(255,255,255,.42)!important}
    @media(max-width:480px){.arabisk-profile-card{padding:22px;border-radius:24px}.arabisk-profile-card h2{font-size:21px}}
  `;
  document.head.appendChild(style);
}

function closeOverlay() {
  document.getElementById('arabisk-profile-overlay')?.remove();
}

function mountOnboarding(initialProfile = null) {
  if (!isStandaloneMode() || document.getElementById('arabisk-profile-overlay')) return;
  injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'arabisk-profile-overlay';
  overlay.className = 'arabisk-profile-overlay';
  overlay.innerHTML = `
    <section class="arabisk-profile-card" role="dialog" aria-modal="true" aria-labelledby="arabisk-profile-title">
      <div class="arabisk-profile-mark" aria-hidden="true">A</div>
      <h2 id="arabisk-profile-title">أهلاً بك في ARABISK</h2>
      <p>خلّي تجربتك أسهل. سجّل اسمك ورقم هاتفك لنربط حجوزاتك وطلباتك وتفضيلاتك بحسابك داخل التطبيق.</p>
      <form id="arabisk-profile-form">
        <label class="arabisk-profile-field"><span>الاسم</span><input name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="اكتب اسمك"></label>
        <label class="arabisk-profile-field"><span>رقم الهاتف</span><input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="05XXXXXXXX"></label>
        <label class="arabisk-profile-consent"><input name="privacyConsent" type="checkbox" required><span>أوافق على <a href="/privacy" target="_blank" rel="noopener">سياسة الخصوصية</a> واستخدام بياناتي لتشغيل حساب ARABISK وإدارة الحجوزات والطلبات والإشعارات المرتبطة بالتطبيق.</span></label>
        <button class="arabisk-profile-submit" type="submit">ابدأ استخدام ARABISK</button>
        <div id="arabisk-profile-note" class="arabisk-profile-note" role="alert" aria-live="polite"></div>
      </form>
      <p class="arabisk-profile-disclaimer">رقم الهاتف يُحفظ كبيانات تعريف للعميل ولا يتم اعتباره رقمًا موثقًا عبر OTP.</p>
    </section>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('#arabisk-profile-form');
  if (initialProfile) {
    form.elements.name.value = initialProfile.name || '';
    form.elements.phone.value = initialProfile.phone || '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const note = overlay.querySelector('#arabisk-profile-note');
    const payload = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      privacyConsent: form.elements.privacyConsent.checked,
      deviceId: getDeviceId()
    };
    button.disabled = true;
    button.textContent = 'جاري إنشاء حسابك…';
    note.textContent = '';
    try {
      const token = getToken();
      const response = await fetch('/api/customer-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-ARABISK-PROFILE-TOKEN': token } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'تعذر إنشاء الحساب الآن.');
      setProfile(data);
      closeOverlay();
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('arabisk:profile-ready', { detail: { profile: data } })), 0);
    } catch (error) {
      note.textContent = error.message || 'تعذر إنشاء الحساب الآن.';
      button.disabled = false;
      button.textContent = 'ابدأ استخدام ARABISK';
    }
  });
}

async function bootstrap() {
  if (!isStandaloneMode()) return;
  if (getToken()) {
    try {
      const profile = await refresh();
      if (profile) return;
    } catch {}
  }
  mountOnboarding(getProfile());
}

window.ARABISK_PROFILE = { getProfile, getToken, refresh };
window.addEventListener('load', () => void bootstrap());
window.addEventListener('appinstalled', () => window.setTimeout(() => void bootstrap(), 600));
})();
