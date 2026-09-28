(() => {
'use strict';

const PROFILE_DATA_KEY='ARABISK_PROFILE_DATA_V1';
const PROFILE_TOKEN_KEY='ARABISK_PROFILE_TOKEN_V1';
const $=selector=>document.querySelector(selector);

const getJson=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const getProfile=()=>getJson(PROFILE_DATA_KEY);
const getToken=()=>{try{return localStorage.getItem(PROFILE_TOKEN_KEY)||''}catch{return ''}};

const money=value=>'AED '+Number(value||0).toFixed(0);
const statusLabel=status=>({
  pending:'قيد المراجعة', confirmed:'تم التأكيد', preparing:'قيد التحضير',
  ready:'جاهز', completed:'مكتمل', cancelled:'ملغي'
}[status]||status||'غير معروف');

const statusClass=status=>{
  if(status==='completed'||status==='confirmed'||status==='ready')return 'success';
  if(status==='cancelled')return 'danger';
  return '';
};

const formatDate=value=>{
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '—';
  return new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(date);
};

const reservationDate=value=>{
  if(!value)return '—';
  const date=new Date(value+'T00:00:00+04:00');
  return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeZone:'Asia/Dubai'}).format(date);
};

function initials(name){
  const parts=String(name||'ARABISK').trim().split(/\s+/).filter(Boolean).slice(0,2);
  return parts.map(part=>part.charAt(0)).join('').toUpperCase()||'A';
}

function renderIdentity(profile,stats={}){
  const name=String(profile?.name||'عميل ARABISK');
  const avatar=$('#profile-avatar');
  const nameNode=$('#profile-customer-name');
  const phoneNode=$('#profile-phone');
  const badge=$('#profile-member-badge');
  const welcome=$('#profile-welcome');
  const memberSince=$('#profile-member-since');
  const memberTitle=$('#profile-member-title');
  const memberSubtitle=$('#profile-member-subtitle');

  if(avatar)avatar.textContent=initials(name);
  if(nameNode)nameNode.textContent=name;
  if(phoneNode)phoneNode.textContent=String(profile?.phone||'');
  if(badge)badge.textContent=Number(stats.orderCount||0)>0?'عضوية عميل ARABISK':'عضوية ARABISK';
  if(welcome)welcome.textContent='مساحتك الشخصية داخل ARABISK.';
  if(memberTitle)memberTitle.textContent=Number(stats.orderCount||0)||Number(stats.reservationCount||0)
    ? 'كل زياراتك وطلباتك في مكان واحد'
    : 'تجربتك مع ARABISK في مكان واحد';
  if(memberSubtitle)memberSubtitle.textContent='تابع طلباتك وحجوزاتك واستخدم خدمات ARABISK من تطبيقك المثبّت.';
  if(memberSince)memberSince.textContent=stats.memberSince?formatDate(stats.memberSince):'عضوية ARABISK';

  const orders=$('#stat-orders');
  const reservations=$('#stat-reservations');
  const spend=$('#stat-spend');
  if(orders)orders.textContent=String(stats.orderCount||0);
  if(reservations)reservations.textContent=String(stats.reservationCount||0);
  if(spend)spend.textContent=money(stats.totalOrderValue||0);
}

function renderOrders(orders=[]){
  const root=$('#profile-orders'); if(!root)return;
  if(!orders.length){
    root.innerHTML='<div class="profile-list-empty">لا توجد طلبات بعد.<br><a href="/menu">ابدأ طلبك الأول</a></div>';
    return;
  }
  root.innerHTML=orders.map(order=>{
    const items=(order.items||[]).map(item=>String(item.nameAr||'صنف')+' × '+Number(item.quantity||0)).join('، ')||'تفاصيل الطلب';
    return '<article class="profile-item">'+
      '<div class="profile-item-top"><span class="profile-item-id">'+esc(order.id)+'</span><span class="profile-status-pill '+statusClass(order.status)+'">'+esc(statusLabel(order.status))+'</span></div>'+
      '<div class="profile-item-meta">'+esc(formatDate(order.createdAt))+' · '+(order.orderType==='pickup'?'استلام':'داخل المطعم')+'</div>'+
      '<div class="profile-item-bottom"><span class="profile-items-line">'+esc(items)+'</span><strong class="profile-item-total">'+money(order.total)+'</strong></div>'+
      '</article>';
  }).join('');
}

function reservationStatus(status){
  return ({pending:'قيد التأكيد',confirmed:'مؤكدة',cancelled:'ملغاة'}[status]||status||'غير معروفة');
}

function renderReservations(reservations=[]){
  const root=$('#profile-reservations'); if(!root)return;
  if(!reservations.length){
    root.innerHTML='<div class="profile-list-empty">لا توجد حجوزات بعد.<br><a href="/reservation">احجز طاولتك</a></div>';
    return;
  }
  root.innerHTML=reservations.map(item=>
    '<article class="profile-item">'+
      '<div class="profile-item-top"><span class="profile-item-id">'+esc(item.id)+'</span><span class="profile-status-pill '+statusClass(item.status)+'">'+esc(reservationStatus(item.status))+'</span></div>'+
      '<div class="profile-item-meta">'+esc(reservationDate(item.date))+' · '+esc(item.time||'—')+' · '+Number(item.guests||0)+' '+(Number(item.guests||0)===1?'ضيف':'ضيوف')+'</div>'+
      (item.notes?'<div class="profile-items-line">'+esc(item.notes)+'</div>':'')+
    '</article>'
  ).join('');
}

function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}

async function loadDashboard(){
  const token=getToken();
  const cached=getProfile();
  if(!token){
    renderIdentity(cached||{},{}); renderOrders([]); renderReservations([]);
    return;
  }
  try{
    const response=await fetch('/api/customer-profile/summary',{
      headers:{'X-ARABISK-PROFILE-TOKEN':token},cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(response.status===401) throw new Error('جلسة العميل غير صالحة.');
    if(!response.ok) throw new Error(data?.message||'تعذر تحميل حسابك الآن.');
    if(data?.profile){
      const profile={...data.profile,profileToken:token};
      try{localStorage.setItem(PROFILE_DATA_KEY,JSON.stringify(profile))}catch{}
      renderIdentity(profile,data.stats||{});
      renderOrders(data.orders||[]);
      renderReservations(data.reservations||[]);
      return;
    }
    renderIdentity(cached||{},{}); renderOrders([]); renderReservations([]);
  }catch{
    renderIdentity(cached||{},{}); renderOrders([]); renderReservations([]);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  void loadDashboard();
  window.addEventListener('arabisk:profile-ready',()=>void loadDashboard());
  window.addEventListener('arabisk:profile-updated',()=>void loadDashboard());
});
})();
