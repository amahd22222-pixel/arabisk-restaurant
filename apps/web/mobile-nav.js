const NAV_ITEMS=[
  {href:'/',label:'الرئيسية',icon:'⌂',match:p=>p==='/'},
  {href:'/menu',label:'المنيو',icon:'≡',match:p=>p==='/menu'||p.startsWith('/menu/')},
  {href:'/cart',label:'السلة',icon:'🛒',match:p=>p==='/cart'},
  {href:'/reservation',label:'الحجز',icon:'◷',match:p=>p==='/reservation'},
  {href:'/memories',label:'الذكريات',icon:'♡',match:p=>p==='/memories'}
];
function mountPwaBottomNav(){
  if(document.querySelector('.pwa-bottom-nav')) return;
  const nav=document.createElement('nav');
  nav.className='pwa-bottom-nav';
  nav.setAttribute('aria-label','التنقل السريع');
  const path=window.location.pathname.replace(/\/$/,'')||'/';
  nav.innerHTML=NAV_ITEMS.map(item=>`<a href="${item.href}" aria-current="${item.match(path)?'page':'false'}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span class="nav-label">${item.label}</span></a>`).join('');
  document.body.appendChild(nav);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mountPwaBottomNav,{once:true});
else mountPwaBottomNav();
