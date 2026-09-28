const ICONS={
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
  shams:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v2M12 19.5v2M4.28 4.28l1.42 1.42M18.3 18.3l1.42 1.42M2.5 12h2M19.5 12h2M4.28 19.72l1.42-1.42M18.3 5.7l1.42-1.42"/></svg>',
  memories:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 8.9c0 5.2-8.8 10.1-8.8 10.1S3.2 14.1 3.2 8.9A4.4 4.4 0 0 1 12 6.1a4.4 4.4 0 0 1 8.8 2.8Z"/></svg>',
  profile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.3" r="3.1"/><path d="M5.2 20c.9-3.2 3.1-4.8 6.8-4.8s5.9 1.6 6.8 4.8"/></svg>'
};

const NAV_ITEMS=[
  {href:'/',label:'الرئيسية',icon:ICONS.home,match:p=>p==='/'},
  {href:'/menu',label:'المنيو',icon:ICONS.menu,match:p=>p==='/menu'||p.startsWith('/menu/')},
  {href:'/shams',label:'شمس',icon:ICONS.shams,match:p=>false,shams:true},
  {href:'/memories',label:'الذكريات',icon:ICONS.memories,match:p=>p==='/memories'||p.startsWith('/memories/')},
  {href:'/profile',label:'حسابي',icon:ICONS.profile,match:p=>p==='/profile'}
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
