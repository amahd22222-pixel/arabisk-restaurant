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
  pending:'قيد المراجعة',
  confirmed:'تم التأكيد',
  preparing:'قيد التحضير',
  ready:'جاهز',
  completed:'مكتمل',
  cancelled:'ملغي'
}[status]||status||'غير معروف');

const statusClass=status=>{
  if(status==='completed'||status==='confirmed'||status==='ready')return 'success';
  if(status==='cancelled')return 'danger';
  return '';
};

const formatDate=value=>{
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value);
  return new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(date);
};

const reservationDate=value=>{
  if(!value)return '—';
  const date=new Date(value+'T00:00:00+04:00');
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('ar-AE',{dateStyle:'medium',timeZone:'Asia/Dubai'}).format(date);
};

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const initials=name=>String(name||'ARABISK').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join('').toUpperCase()||'A';

function renderIdentity(profile,stats={}) {
  const name=String(profile?.name||'عميل ARABISK');
  $('#profile-avatar').textContent=initials(name);
  const nameHeading=$('#profile-name-heading');
  if(nameHeading) nameHeading.textContent=name;
  $('#profile-member-badge').textContent=Number(stats.orderCount||0)>0?'عضوية عميل ARABISK':'عضوية ARABISK جديدة';
  $('#profile-member-since').textContent=stats.memberSince?formatDate(stats.memberSince):'—';
  $('#stat-orders').textContent=String(stats.orderCount||0);
  $('#stat-reservations').textContent=String(stats.reservationCount||0);
  $('#stat-spend').textContent=money(stats.totalOrderValue||0);
}

function renderOrders(orders=[]) {
  const root=$('#profile-orders');
  if(!root)return;
  if(!orders.length){
    root.innerHTML='<div class="profile-list-empty">لا توجد طلبات سابقة حتى الآن.<br><a href="/menu">ابدأ أول طلب</a></div>';
    return;
  }
  root.innerHTML=orders.map(order=>{
    const items=(order.items||[]).map(item=>String(item.nameAr||'صنف')+' × '+Number(item.quantity||0)).join('، ')||'تفاصيل الطلب متاحة عند فتحه';
    return '<article class="profile-item">'+
      '<div class="profile-item-top"><span class="profile-item-id">'+esc(order.id)+'</span><span class="profile-status-pill '+statusClass(order.status)+'">'+esc(statusLabel(order.status))+'</span></div>'+
      '<div class="profile-item-meta">'+esc(formatDate(order.createdAt))+' · '+(order.orderType==='pickup'?'استلام من المطعم':'داخل المطعم')+'</div>'+
      '<div class="profile-item-bottom"><span class="profile-items-line">'+esc(items)+'</span><strong class="profile-item-total">'+money(order.total)+'</strong></div>'+
      '</article>';
  }).join('');
}

const reservationStatus=status=>({pending:'قيد التأكيد',confirmed:'مؤكدة',cancelled:'ملغاة'}[status]||status||'غير معروفة');

function renderReservations(reservations=[]) {
  const root=$('#profile-reservations');
  if(!root)return;
  if(!reservations.length){
    root.innerHTML='<div class="profile-list-empty">لا توجد حجوزات حتى الآن.<br><a href="/reservation">احجز طاولتك</a></div>';
    return;
  }
  root.innerHTML=reservations.slice(0,5).map(item=>
    '<article class="profile-item">'+
      '<div class="profile-item-top"><span class="profile-item-id">'+esc(item.id)+'</span><span class="profile-status-pill '+statusClass(item.status)+'">'+esc(reservationStatus(item.status))+'</span></div>'+
      '<div class="profile-item-meta">'+esc(reservationDate(item.date))+' · '+esc(item.time||'—')+' · '+Number(item.guests||0)+' '+(Number(item.guests||0)===1?'ضيف':'ضيوف')+'</div>'+
      (item.notes?'<div class="profile-items-line">'+esc(item.notes)+'</div>':'')+
    '</article>'
  ).join('');
}

function showMessage(message='',error=false) {
  const node=$('#profile-status');
  if(!node)return;
  node.textContent=message;
  node.classList.toggle('error',Boolean(error));
}

async function loadDashboard() {
  const token=getToken();
  const cached=getProfile();

  if(!token) {
    renderIdentity(cached||{},{});
    renderOrders([]);
    renderReservations([]);
    showMessage('');
    return;
  }

  try {
    const response=await fetch('/api/customer-profile/summary',{
      headers:{'X-ARABISK-PROFILE-TOKEN':token},
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));

    if(response.status===401) {
      renderIdentity(cached||{},{});
      renderOrders([]);
      renderReservations([]);
      showMessage('تعذر تحديث الحساب الآن. نعرض آخر بيانات محفوظة على الجهاز.',true);
      return;
    }

    if(!response.ok)throw new Error(data?.message||'تعذر تحميل الحساب الآن.');

    if(data?.profile) {
      const profile={...data.profile,profileToken:token};
      try{localStorage.setItem(PROFILE_DATA_KEY,JSON.stringify(profile))}catch{}
      renderIdentity(profile,data.stats||{});
      renderOrders(data.orders||[]);
      renderReservations(data.reservations||[]);
      showMessage('');
    }
  } catch(error) {
    renderIdentity(cached||{},{});
    renderOrders([]);
    renderReservations([]);
    if(cached)showMessage('الاتصال غير متاح حاليًا. نعرض آخر بيانات محفوظة على الجهاز.',false);
    else showMessage('',false);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  void loadDashboard();
  window.addEventListener('arabisk:profile-ready',event=>{
    if(event.detail?.profile)void loadDashboard();
  });
  window.addEventListener('arabisk:profile-updated',()=>void loadDashboard());
});
})();