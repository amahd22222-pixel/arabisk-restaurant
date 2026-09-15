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
    .arabisk-studio-display{width:100%;height:min(78vh,860px);min-height:320px;background:#000;overflow:hidden}
    .arabisk-studio-display video{display:block;width:100%;height:100%;object-fit:cover;background:#000}
    .arabisk-studio-category{margin:0 0 34px;background:#000;overflow:hidden}
    .arabisk-studio-category .arabisk-studio-display{height:min(62vh,720px);min-height:260px}
  `;
  document.head.appendChild(style);
}

function renderVideo(item){
  const desktop=item.desktopVideoUrl||item.mobileVideoUrl;
  const mobile=item.mobileVideoUrl||desktop;
  if(!desktop)return '';
  ensureStyle();
  return `<div class="arabisk-studio-display"><video autoplay muted loop playsinline preload="metadata" aria-label="ARABISK Studio"><source media="(max-width:700px)" src="${esc(mobile)}"><source src="${esc(desktop)}"></video></div>`;
}

function renderHome(items){
  const home=document.querySelector('#home');
  if(!home)return;
  if(!items.length){home.replaceChildren();home.hidden=true;return;}
  home.hidden=false;
  home.className='';
  home.innerHTML=renderVideo(items[0]);
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
}

document.addEventListener('DOMContentLoaded',async()=>{
  if(/^\/menu\/[^/]+\/?$/.test(location.pathname)){
    await renderCategory();
  }else{
    renderHome(await loadHomeStudio());
  }
});
