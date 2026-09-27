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
    .arabisk-studio-display{position:absolute;inset:0;width:100%;height:100%;background:#000;overflow:hidden}
    .arabisk-studio-display::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,7,5,.72),rgba(9,7,5,.26) 58%,rgba(9,7,5,.38))}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000;cursor:pointer}
    .arabisk-studio-mute{position:absolute;right:18px;bottom:18px;z-index:5;width:44px;height:44px;border:1px solid rgba(255,255,255,.5);border-radius:999px;background:rgba(0,0,0,.52);color:#fff;display:grid;place-items:center;font-size:18px;line-height:1;cursor:pointer;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);transition:background .2s ease,transform .2s ease}
    .arabisk-studio-mute:hover{background:rgba(0,0,0,.78);transform:scale(1.04)}
    .arabisk-studio-mute:focus-visible{outline:2px solid #fff;outline-offset:2px}
    @media(max-width:700px){.arabisk-studio-mute{right:12px;bottom:12px;width:40px;height:40px;font-size:16px}}
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
  return `<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video><button class="arabisk-studio-mute" type="button" aria-label="تشغيل الصوت" title="تشغيل الصوت">🔇</button></div>`;
}

function renderHome(items) {
  const home = document.querySelector('#app-hero-studio');
  if (!home || location.pathname.replace(/\/$/,'') !== '') return;

  if (!items.length) {
    home.innerHTML = '';
    return;
  }

  home.innerHTML = renderVideo(items[0]);
  const wrapper = home.querySelector('.arabisk-studio-display');
  if (wrapper) bindMute(wrapper);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (location.pathname.replace(/\/$/,'') !== '') return;
  renderHome(await loadHomeStudio());
});
