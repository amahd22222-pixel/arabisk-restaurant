const API = 'https://web-production-d41a3.up.railway.app';
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

function injectStudioStyles() {
  if (document.getElementById('studio-display-style')) return;
  const style = document.createElement('style');
  style.id = 'studio-display-style';
  style.textContent = `
    #home.managed-studio-hidden{display:none!important}
    .arabisk-studio-display{width:100%;height:min(78vh,860px);min-height:420px;background:#000;overflow:hidden;position:relative}
    .arabisk-studio-display video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;background:#000}
    .arabisk-studio-display.empty{display:none}
    .arabisk-studio-audio-toggle{position:absolute;right:18px;bottom:18px;z-index:3;width:46px;height:46px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(0,0,0,.58);color:#fff;display:grid;place-items:center;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:transform .18s ease,background .18s ease}
    .arabisk-studio-audio-toggle:hover{transform:scale(1.05);background:rgba(0,0,0,.72)}
    .arabisk-studio-audio-toggle:focus-visible{outline:2px solid #fff;outline-offset:3px}
    .arabisk-studio-audio-toggle svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    @media(max-width:700px){.arabisk-studio-display{height:72vh;min-height:320px}.arabisk-studio-audio-toggle{right:14px;bottom:14px;width:42px;height:42px}}
  `;
  document.head.appendChild(style);
}

async function loadStudio() {
  try {
    const response = await fetch(`${API}/api/studio/shows?active=true`, { cache:'no-store' });
    if (!response.ok) return [];
    const items = await response.json();
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function renderStudio(items) {
  const home = document.querySelector('#home');
  const menu = document.querySelector('#menu');
  if (!home || !menu) return;

  document.querySelectorAll('.managed-banner-hero,.managed-home-promo,.managed-menu-promo,.managed-footer-promo').forEach((el) => el.remove());
  document.querySelector('#arabisk-studio-display')?.remove();

  // Keep the normal homepage hero visible until an actual Studio العرض is configured.
  if (!items.length) {
    home.classList.remove('managed-studio-hidden');
    return;
  }

  home.classList.add('managed-studio-hidden');

  const display = document.createElement('section');
  display.id = 'arabisk-studio-display';
  display.className = 'arabisk-studio-display';
  display.setAttribute('aria-label','ARABISK Studio');
  const item = items[0];
  const mobile = item.mobileVideoUrl || item.desktopVideoUrl;
  const desktop = item.desktopVideoUrl || item.mobileVideoUrl;
  display.innerHTML = `
    <video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio">
      <source media="(max-width:700px)" src="${esc(mobile)}">
      <source src="${esc(desktop)}">
    </video>
    <button class="arabisk-studio-audio-toggle" type="button" aria-label="تشغيل الصوت" aria-pressed="false" title="تشغيل الصوت">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m15 9 4 6"/><path d="m19 9-4 6"/></svg>
    </button>`;

  const video = display.querySelector('video');
  const button = display.querySelector('.arabisk-studio-audio-toggle');
  const iconMuted = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m15 9 4 6"/><path d="m19 9-4 6"/></svg>`;
  const iconSound = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a9 9 0 0 1 0 12"/></svg>`;

  const syncAudioButton = () => {
    const isMuted = video.muted;
    button.innerHTML = isMuted ? iconMuted : iconSound;
    button.setAttribute('aria-pressed', String(!isMuted));
    button.setAttribute('aria-label', isMuted ? 'تشغيل الصوت' : 'كتم الصوت');
    button.title = isMuted ? 'تشغيل الصوت' : 'كتم الصوت';
  };

  button.addEventListener('click', async () => {
    try {
      video.muted = !video.muted;
      if (!video.muted && video.paused) await video.play();
      syncAudioButton();
    } catch {
      video.muted = true;
      syncAudioButton();
    }
  });

  video.addEventListener('volumechange', syncAudioButton);
  syncAudioButton();
  menu.parentNode.insertBefore(display, menu);
}

document.addEventListener('DOMContentLoaded', async () => {
  injectStudioStyles();
  const items = await loadStudio();
  renderStudio(items);
});
