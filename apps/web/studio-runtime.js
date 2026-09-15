const API='https://web-production-d41a3.up.railway.app';

const esc=(v)=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
const slug=(v)=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

async function api(path){try{const r=await fetch(`${API}${path}`,{cache:'no-store'});return r.ok?await r.json():[];}catch{return[];}}
const loadHomeStudio=()=>api('/api/studio/shows?active=true&placement=home');
const loadCategoryStudio=(categoryId)=>api(`/api/studio/shows?active=true&placement=category&categoryId=${encodeURIComponent(categoryId)}`);
const loadCategories=()=>api('/api/categories');

function ensureStyle(){
  if(document.querySelector('#arabisk-studio-runtime-style'))return;
  const style=document.createElement('style');
  style.id='arabisk-studio-runtime-style';
  style.textContent=`
    .arabisk-studio-display{position:relative;width:100%;height:min(78vh,860px);min-height:320px;background:#000;overflow:hidden}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000;cursor:pointer}
    .arabisk-studio-category{margin:0 0 34px;background:#000;overflow:hidden}
    .arabisk-studio-category .arabisk-studio-display{height:min(62vh,720px);min-height:260px}
    .arabisk-studio-mute{position:absolute;right:18px;bottom:18px;z-index:5;width:46px;height:46px;border:1px solid rgba(255,255,255,.55);border-radius:999px;background:rgba(0,0,0,.62);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .2s ease,transform .2s ease}
    .arabisk-studio-mute:hover{background:rgba(0,0,0,.8);transform:scale(1.04)}
    .arabisk-studio-mute:focus-visible{outline:2px solid #fff;outline-offset:2px}
    @media(max-width:700px){.arabisk-studio-mute{right:12px;bottom:12px;width:42px;height:42px;font-size:18px}}
  `;
  document.head.appendChild(style);
}

function bindMute(wrapper){
  const video=wrapper.querySelector('video');
  const button=wrapper.querySelector('.arabisk-studio-mute');
  if(!video||!button)return;
  const sync=()=>{
    button.textContent=video.muted?'🔇':'🔊';
    button.setAttribute('aria-label',video.muted?'تشغيل الصوت':'كتم الصوت');
    button.title=video.muted?'تشغيل الصوت':'كتم الصوت';
  };
  button.addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopPropagation();
    video.muted=!video.muted;
    if(!video.muted){video.volume=1;video.play().catch(()=>{});}
    sync();
  });
  sync();
}

function renderVideo(item){
  const desktop=item.desktopVideoUrl||item.mobileVideoUrl;
  const mobile=item.mobileVideoUrl||desktop;
  if(!desktop)return '';
  ensureStyle();
  return `<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video><button class="arabisk-studio-mute" type="button" aria-label="تشغيل الصوت" title="تشغيل الصوت">🔇</button></div>`;
}

function mountVideo(target,html){
  target.innerHTML=html;
  const wrapper=target.querySelector('.arabisk-studio-display');
  if(wrapper)bindMute(wrapper);
}

function renderHome(items){
  const home=document.querySelector('#home');
  if(!home)return;
  if(!items.length){home.replaceChildren();home.hidden=true;return;}
  home.hidden=false;
  home.className='';
  mountVideo(home,renderVideo(items[0]));
}

async function renderCategory(){
  const match=location.pathname.match(/^\/menu\/([^/]+)\/?$/);
  const categoryDetail=document.querySelector('#category-detail');
  const categoryBanner=document.querySelector('#category-banner');
  if(!match||!categoryDetail||!categoryBanner)return;
  const categories=await loadCategories();
  const wanted=decodeURIComponent(match[1]);
  const category=Array.isArray(categories)?categories.find(c=>slug(c.id)===wanted):null;
  if(!category)return;
  const items=await loadCategoryStudio(category.id);
  document.querySelector('#arabisk-studio-category')?.remove();
  if(!items.length)return;
  const wrapper=document.createElement('div');
  wrapper.id='arabisk-studio-category';
  wrapper.className='arabisk-studio-category';
  wrapper.innerHTML=renderVideo(items[0]);
  categoryDetail.insertBefore(wrapper,categoryBanner);
  const studio=wrapper.querySelector('.arabisk-studio-display');
  if(studio)bindMute(studio);
}

document.addEventListener('DOMContentLoaded',async()=>{
  if(/^\/menu\/[^/]+\/?$/.test(location.pathname)){
    await renderCategory();
  }else{
    renderHome(await loadHomeStudio());
  }
});
