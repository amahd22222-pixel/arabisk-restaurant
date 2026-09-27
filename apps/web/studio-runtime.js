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
  } catch { return []; }
}

function ensureStyle() {
  if (document.querySelector('#arabisk-studio-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'arabisk-studio-runtime-style';
  style.textContent = `
    .app-hero-studio{pointer-events:none;position:absolute;inset:0;z-index:0}
    .arabisk-studio-display{position:absolute;inset:0;overflow:hidden;background:#000;z-index:0;opacity:.48}
    .arabisk-studio-display::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,7,5,.82),rgba(9,7,5,.35) 55%,rgba(9,7,5,.58));pointer-events:none}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000}
    .arabisk-studio-mute{pointer-events:auto;position:absolute;right:18px;bottom:18px;z-index:5;width:46px;height:46px;border:1px solid rgba(255,255,255,.55);border-radius:999px;background:rgba(0,0,0,.56);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    .arabisk-studio-mute:focus-visible{outline:2px solid #fff;outline-offset:2px}
    @media(max-width:700px){.arabisk-studio-display{opacity:.42}.arabisk-studio-mute{right:12px;bottom:12px;width:42px;height:42px;font-size:18px}}
  `;
  document.head.appendChild(style);
}

function bindMute(wrapper) {
  const video = wrapper.querySelector('video');
  const button = wrapper.querySelector('.arabisk-studio-mute');
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
    if (!video.muted) { video.volume = 1; video.play().catch(() => {}); }
    sync();
  });
  sync();
}

function renderVideo(item) {
  if (!item) return '';
  const desktop = item.desktopVideoUrl || item.mobileVideoUrl;
  const mobile = item.mobileVideoUrl || desktop;
  if (!desktop) return '';
  ensureStyle();
  return `<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio — العرض المرئي الرئيسي"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video><button class="arabisk-studio-mute" type="button" aria-label="تشغيل الصوت" title="تشغيل الصوت">🔇</button></div>`;
}

function renderHome(items) {
  const slot = document.querySelector('#app-hero-studio');
  if (!slot || location.pathname.replace(/\/$/, '') !== '') return;
  slot.replaceChildren();
  const videoMarkup = renderVideo(items[0]);
  slot.hidden = !videoMarkup;
  if (!videoMarkup) return;
  slot.innerHTML = videoMarkup;
  const wrapper = slot.querySelector('.arabisk-studio-display');
  if (wrapper) bindMute(wrapper);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (location.pathname.replace(/\/$/,'') !== '') return;
  renderHome(await loadHomeStudio());
});