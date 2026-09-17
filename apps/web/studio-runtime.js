const API = '/api/studio/shows?active=true';

const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({
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
    .arabisk-studio-display{position:relative;width:100%;height:min(78vh,860px);min-height:320px;background:#000;overflow:hidden}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000;cursor:pointer}
    .arabisk-studio-mute{position:absolute;right:18px;bottom:18px;z-index:5;width:46px;height:46px;border:1px solid rgba(255,255,255,.55);border-radius:999px;background:rgba(0,0,0,.62);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .2s ease,transform .2s ease}
    .arabisk-studio-mute:hover{background:rgba(0,0,0,.8);transform:scale(1.04)}
    .arabisk-studio-mute:focus-visible{outline:2px solid #fff;outline-offset:2px}
    @media(max-width:700px){.arabisk-studio-mute{right:12px;bottom:12px;width:42px;height:42px;font-size:18px}}
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
  const home = document.querySelector('#home');
  if (!home || location.pathname.replace(/\/$/, '') !== '') return;

  if (!items.length) {
    home.hidden = true;
    return;
  }

  home.hidden = false;
  home.className = '';
  home.innerHTML = renderVideo(items[0]);
  const wrapper = home.querySelector('.arabisk-studio-display');
  if (wrapper) bindMute(wrapper);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (location.pathname.replace(/\/$/, '') !== '') return;
  renderHome(await loadHomeStudio());
});
