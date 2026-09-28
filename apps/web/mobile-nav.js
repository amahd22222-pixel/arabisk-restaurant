const NAV_ITEMS=[
  {href:'/',label:'الرئيسية',icon:'⌂',match:p=>p==='/'},
  {href:'/menu',label:'المنيو',icon:'≡',match:p=>p==='/menu'||p.startsWith('/menu/')},
  {href:'/offers',label:'العروض',icon:'%',match:p=>p==='/offers'},
  {href:'/reservation',label:'الحجز',icon:'◷',match:p=>p==='/reservation'},
  {href:'/cart',label:'السلة',icon:'🛒',match:p=>p==='/cart'||p.startsWith('/cart/'),cart:true}
];
function mountPwaBottomNav(){
  if(document.querySelector('.pwa-bottom-nav'))return;
  const nav=document.createElement('nav');
  nav.className='pwa-bottom-nav';
  nav.setAttribute('aria-label','التنقل السريع');
  const path=window.location.pathname.replace(/\/$/,'')||'/';
  nav.innerHTML=NAV_ITEMS.map(item=>{
    const current=item.match(path);
    return '<a href="'+item.href+'" class="nav-item'+(item.cart?' nav-cart':'')+'"'+(current?' aria-current="page"':'')+'>'+
      '<span class="nav-icon" aria-hidden="true">'+item.icon+'</span>'+
      (item.cart?'<b class="nav-cart-count" id="mobile-cart-count" hidden>0</b>':'')+
      '<span class="nav-label">'+item.label+'</span></a>';
  }).join('');
  document.body.appendChild(nav);
  updateMobileCartCount();
}
function updateMobileCartCount(){
  const count=document.getElementById('mobile-cart-count');
  if(!count)return;
  const value=Number(window.ARABISK_CART?.count?.() || 0);
  count.textContent=value>99?'99+':String(value);
  count.hidden=value<=0;
}
window.addEventListener('arabisk:cart-updated',updateMobileCartCount);
window.addEventListener('storage',updateMobileCartCount);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPwaBottomNav,{once:true});else mountPwaBottomNav();
