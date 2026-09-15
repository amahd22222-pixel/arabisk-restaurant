const API='https://web-production-d41a3.up.railway.app';

const esc=(v)=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

async function loadStudio(){
  try{
    const r=await fetch(`${API}/api/studio/shows?active=true&placement=home`,{cache:'no-store'});
    return r.ok?await r.json():[];
  }catch{return[];}
}

function render(items){
  const home=document.querySelector('#home');
  if(!home)return;
  if(!items.length){home.replaceChildren();home.hidden=true;return;}
  const item=items[0];
  const desktop=item.desktopVideoUrl||item.mobileVideoUrl;
  const mobile=item.mobileVideoUrl||desktop;
  home.hidden=false;
  home.className='';
  home.innerHTML=`<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video></div>`;
  const style=document.createElement('style');
  style.textContent='.arabisk-studio-display{width:100%;height:min(78vh,860px);min-height:320px;background:#000;overflow:hidden}.arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000}';
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded',async()=>render(await loadStudio()));
