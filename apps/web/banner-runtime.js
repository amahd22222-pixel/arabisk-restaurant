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
    @media(max-width:700px){.arabisk-studio-display{height:72vh;min-height:320px}}
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
  home.classList.add('managed-studio-hidden');
  document.querySelectorAll('.managed-banner-hero,.managed-home-promo,.managed-menu-promo,.managed-footer-promo').forEach((el) => el.remove());
  document.querySelector('#arabisk-studio-display')?.remove();
  if (!items.length) return;

  const display = document.createElement('section');
  display.id = 'arabisk-studio-display';
  display.className = 'arabisk-studio-display';
  display.setAttribute('aria-label','ARABISK Studio');
  const item = items[0];
  const mobile = item.mobileVideoUrl || item.desktopVideoUrl;
  const desktop = item.desktopVideoUrl || item.mobileVideoUrl;
  display.innerHTML = `<video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video>`;
  menu.parentNode.insertBefore(display, menu);
}

document.addEventListener('DOMContentLoaded', async () => {
  injectStudioStyles();
  const items = await loadStudio();
  renderStudio(items);
});
