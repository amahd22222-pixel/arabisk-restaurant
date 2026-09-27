const NAV_ITEMS=[
  {href:'/',label:'الرئيسية',icon:'⌂',match:p=>p==='/'},
  {href:'/menu',label:'المنيو',icon:'≡',match:p=>p==='/menu'||p.startsWith('/menu/')},
  {href:'/cart',label:'السلة',icon:'▱',match:p=>p==='/cart'},
  {href:'/reservation',label:'الحجز',icon:'◷',match:p=>p==='/reservation'},
  {href:'/memories',label:'الذكريات',icon:'♡',match:p=>p==='/memories'}
];

function syncPwaCartCount(){
  const badge=document.querySelector('#pwa-nav-cart-count');
  if(!badge)return;
  const items=window.ARABISK_CART?.getItems?.()||[];
  const count=items.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
  badge.textContent=String(count);
  badge.hidden=count<1;
}

function mountPwaBottomNav(){
  if(document.querySelector('.pwa-bottom-nav'))return;
  const nav=document.createElement('nav');
  nav.className='pwa-bottom-nav';
  nav.setAttribute('aria-label','التنقل السريع');
  const path=window.location.pathname.replace(/\/$/,'')||'/';
  nav.innerHTML=NAV_ITEMS.map(item=>`<a href="${item.href}" aria-current="${item.match(path)?'page':'false'}"><span class="nav-icon" aria-hidden="true">${item.icon}${item.href==='/cart'?'<b class="nav-count" id="pwa-nav-cart-count" hidden>0</b>':''}</span><span class="nav-label">${item.label}</span></a>`).join('');
  document.body.appendChild(nav);
  syncPwaCartCount();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPwaBottomNav,{once:true});else mountPwaBottomNav();
window.addEventListener('arabisk-cart-updated',syncPwaCartCount);
window.addEventListener('storage',event=>{if(event.key==='arabisk-cart-v4')syncPwaCartCount()});
window.addEventListener('pageshow',syncPwaCartCount);