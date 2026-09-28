const NAV_ITEMS=[
  {href:'/',label:'الرئيسية',icon:'⌂',match:p=>p==='/'},
  {href:'/menu',label:'المنيو',icon:'≡',match:p=>p==='/menu'||p.startsWith('/menu/')},
  {href:'/shams',label:'شمس',icon:'☀',match:p=>false,shams:true},
  {href:'/memories',label:'الذكريات',icon:'♡',match:p=>p==='/memories'||p.startsWith('/memories/')},
  {href:'/profile',label:'حسابي',icon:'◎',match:p=>p==='/profile'}
];

function mountPwaBottomNav(){
  if(document.querySelector('.pwa-bottom-nav'))return;
  const nav=document.createElement('nav');
  nav.className='pwa-bottom-nav';
  nav.setAttribute('aria-label','التنقل السريع');
  const path=window.location.pathname.replace(/\/$/,'')||'/';
  nav.innerHTML=NAV_ITEMS.map((item,index)=>{
    const current=!item.shams&&item.match(path);
    const center=item.shams?' shams-tab':'';
    return `<a class="${center}" href="${item.href}" data-nav-index="${index}"${current?' aria-current="page"':''}`+
      (item.shams?' data-shams-trigger="true" aria-label="تحدث مع شمس"':'')+
      `><span class="nav-icon" aria-hidden="true">${item.icon}</span>${item.shams ? "" : `<span class="nav-label">${item.label}</span>`}</a>`;
  }).join('');
  document.body.appendChild(nav);

  const shamsTab=nav.querySelector('[data-shams-trigger]');
  shamsTab?.addEventListener('click',(event)=>{
    event.preventDefault();
    const shams=window.ARABISK_SHAMS;
    if(shams?.status && shams?.close && shams?.open){
      const status=shams.status();
      if(status.listening || status.speaking || status.busy || status.conversationActive){
        shams.close();
      }else{
        shams.open();
      }
      return;
    }
    window.setTimeout(()=>window.ARABISK_SHAMS?.open?.(),300);
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPwaBottomNav,{once:true});
else mountPwaBottomNav();