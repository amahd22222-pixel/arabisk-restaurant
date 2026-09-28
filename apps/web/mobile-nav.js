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
      (item.shams?' data-shams-trigger="true" aria-label="تحدث مع شمس" aria-pressed="false"':'')+
      `><span class="nav-icon" aria-hidden="true">${item.icon}</span><span class="nav-label">${item.label}</span></a>`;
  }).join('');
  document.body.appendChild(nav);

  const shamsTab=nav.querySelector('[data-shams-trigger]');
  const syncShamsState=()=>{
    if(!shamsTab)return;
    try{
      const status=window.ARABISK_SHAMS?.status?.();
      const active=Boolean(status?.listening||status?.speaking||status?.busy||status?.conversationActive);
      shamsTab.classList.toggle('is-active',active);
      shamsTab.setAttribute('aria-pressed',String(active));
    }catch{
      shamsTab.classList.remove('is-active');
      shamsTab.setAttribute('aria-pressed','false');
    }
  };

  shamsTab?.addEventListener('click',(event)=>{
    event.preventDefault();
    const shams=window.ARABISK_SHAMS;
    if(shams?.status&&shams?.close&&shams?.open){
      const status=shams.status();
      const active=Boolean(status?.listening||status?.speaking||status?.busy||status?.conversationActive);
      if(active) shams.close();
      else shams.open();
      window.setTimeout(syncShamsState,120);
      return;
    }
    window.setTimeout(()=>{
      window.ARABISK_SHAMS?.open?.();
      syncShamsState();
    },300);
  });

  syncShamsState();
  window.setInterval(syncShamsState,750);
  window.addEventListener('pageshow',syncShamsState,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncShamsState()},{passive:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountPwaBottomNav,{once:true});
else mountPwaBottomNav();