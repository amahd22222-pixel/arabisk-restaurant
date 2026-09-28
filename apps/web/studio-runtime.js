const API = '/api/studio/shows?active=true';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

async function loadHomeStudio() {
  try {
    const response = await fetch(API, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function ensureStyle() {
  if (document.querySelector('#arabisk-studio-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'arabisk-studio-runtime-style';
  style.textContent = `
    .arabisk-studio-display{position:absolute;inset:0;overflow:hidden;background:#000;z-index:0;opacity:.74;pointer-events:none}
    .arabisk-studio-display::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,7,5,.72),rgba(9,7,5,.28) 55%,rgba(9,7,5,.42));pointer-events:none}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000;cursor:pointer;pointer-events:none}
    .arabisk-studio-mute{position:absolute;right:18px;bottom:clamp(96px,12vh,132px);z-index:60;pointer-events:auto;width:46px;height:46px;border:1px solid rgba(255,255,255,.55);border-radius:999px;background:rgba(0,0,0,.56);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .2s ease,transform .2s ease}
    .arabisk-studio-mute:hover{background:rgba(0,0,0,.8);transform:scale(1.04)}
    .arabisk-studio-mute:focus-visible{outline:2px solid #fff;outline-offset:2px}
    @media(max-width:700px){.arabisk-studio-display{opacity:.66}.arabisk-studio-mute{right:12px;bottom:108px;width:44px;height:44px;font-size:18px;z-index:60}}
  `;
  document.head.appendChild(style);
}

function bindMute(wrapper, button) {
  const video = wrapper.querySelector('video');
  if (!video || !button) return;

  const sync = () => {
    button.textContent = video.muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', video.muted ? 'تشغيل الصوت' : 'كتم الصوت');
    button.title = video.muted ? 'تشغيل الصوت' : 'كتم الصوت';
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    video.muted = !video.muted;
    if (!video.muted) {
      video.volume = 1;
      video.play().catch(() => {});
    }
    sync();
  });

  sync();
}

function renderVideo(item) {
  const desktop = item.desktopVideoUrl || item.mobileVideoUrl;
  const mobile = item.mobileVideoUrl || desktop;
  if (!desktop) return '';

  ensureStyle();
  return `<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio — العرض المرئي الرئيسي"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video></div>`;
}

function renderHome(items) {
  const home = document.querySelector('#home');
  const slot = document.querySelector('#app-hero-studio');
  if (!home || !slot || location.pathname.replace(/\/$/, '') !== '') return;

  slot.innerHTML = '';
  const videoMarkup = renderVideo(items[0]);
  if (!videoMarkup) {
    slot.hidden = true;
    return;
  }

  slot.hidden = false;
  slot.style.pointerEvents = 'none';
  slot.innerHTML = videoMarkup;

  const wrapper = slot.querySelector('.arabisk-studio-display');
  if (!wrapper) return;

  let button = home.querySelector('.arabisk-studio-mute');
  if (!button) {
    button = document.createElement('button');
    button.className = 'arabisk-studio-mute';
    button.type = 'button';
    button.setAttribute('aria-label', 'تشغيل الصوت');
    button.title = 'تشغيل الصوت';
    button.textContent = '🔇';
    home.appendChild(button);
  }

  bindMute(wrapper, button);
}
document.addEventListener('DOMContentLoaded', async () => {
  if (location.pathname.replace(/\/$/,'') !== '') return;
  renderHome(await loadHomeStudio());
});
