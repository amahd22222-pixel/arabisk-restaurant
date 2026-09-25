import { request } from './api-client.js';

const ciEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const ciMoney=value=>'AED '+Number(value||0).toFixed(0);

async function customerIntelRequest(path){
  return request(path);
}

function customerIntelSegmentKeyMatch(segment,terms){
  const value=(segment.key+' '+segment.label+' '+segment.description).toLowerCase();
  return terms.some(term=>value.includes(term));
}

function renderCustomerIntel({customers=[],segments=[]}){
  const section=document.querySelector('#customers');
  if(!section)return;
  let panel=document.querySelector('#customer-intelligence-panel');
  if(!panel){
    panel=document.createElement('div');
    panel.id='customer-intelligence-panel';
    panel.className='customer-intelligence-panel';
    const anchor=section.querySelector('.customer-segments');
    if(anchor)anchor.insertAdjacentElement('beforebegin',panel);
    else section.prepend(panel);
  }

  const returning=segments.filter(segment=>customerIntelSegmentKeyMatch(segment,['returning','عود','عودة']));
  const inactive=segments.filter(segment=>customerIntelSegmentKeyMatch(segment,['inactive','غير نشط','تنشيط']));
  const totalRevenue=customers.reduce((sum,customer)=>sum+Number(customer.totalRevenue||0),0);
  const repeatCustomers=customers.filter(customer=>Number(customer.orderCount||0)>1).length;
  const opportunityCustomers=new Map();
  [...returning,...inactive].forEach(segment=>(segment.members||[]).forEach(member=>{
    if(member.id&&!opportunityCustomers.has(member.id))opportunityCustomers.set(member.id,{...member,source:segment.label});
  }));
  const examples=[...opportunityCustomers.values()].sort((a,b)=>Number(b.totalRevenue||0)-Number(a.totalRevenue||0)).slice(0,4);
  const actionable=segments.filter(segment=>Number(segment.count||0)>0).sort((a,b)=>Number(b.count||0)-Number(a.count||0)).slice(0,4);

  panel.innerHTML='<div class="customer-intelligence-head"><div><span>ARABISK CUSTOMER INTELLIGENCE</span><h3>نبض العملاء</h3><p>صورة تشغيلية مختصرة من بيانات العملاء والشرائح الحالية، مرتبطة مباشرة بالإجراءات الموجودة في النظام.</p></div><button id="customer-intelligence-refresh" class="small-action" type="button">تحديث</button></div>'+
    '<div class="customer-intelligence-kpis">'+
      '<article><span>عملاء مسجلون</span><b>'+customers.length+'</b><small>عملاء فريدون في قاعدة العملاء</small></article>'+
      '<article><span>قيمة الطلبات المسجلة</span><b>'+ciMoney(totalRevenue)+'</b><small>إجمالي قيمة الطلبات المرتبطة بالعملاء</small></article>'+
      '<article><span>عملاء متكررون</span><b>'+repeatCustomers+'</b><small>أكثر من طلب واحد</small></article>'+
      '<article><span>فرص قابلة للتنفيذ</span><b>'+opportunityCustomers.size+'</b><small>عودة أو إعادة تنشيط ضمن البيانات الحالية</small></article>'+
    '</div>'+
    '<div class="customer-intelligence-grid">'+
      '<div class="customer-intelligence-panel-card"><div class="ci-card-head"><div><h4>الشرائح القابلة للتنفيذ</h4><span>اضغط على الشريحة لعرض أعضائها.</span></div></div><div class="ci-segment-list">'+
        (actionable.map(segment=>'<button class="ci-segment" type="button" data-ci-segment="'+ciEscape(segment.key)+'"><span>'+ciEscape(segment.label)+'</span><b>'+Number(segment.count||0)+'</b><small>'+ciEscape(segment.recommendedAction||segment.description||'راجع الشريحة وحدد الإجراء المناسب.')+'</small></button>').join('')||'<div class="empty">لا توجد شرائح قابلة للتنفيذ حاليًا.</div>')+
      '</div></div>'+
      '<div class="customer-intelligence-panel-card"><div class="ci-card-head"><div><h4>عينات من فرص العملاء</h4><span>بيانات مختصرة للوصول السريع إلى Customer 360.</span></div></div><div class="ci-customer-list">'+
        (examples.map(member=>'<article class="ci-customer"><div><strong>'+ciEscape(member.name||'عميل')+'</strong><small dir="ltr">'+ciEscape(member.phone||'')+'</small><span>'+ciEscape(member.source||'فرصة عميل')+'</span></div><div><b>'+Number(member.orderCount||0)+' طلب</b><small>'+ciMoney(member.totalRevenue||0)+'</small></div><button class="small-action" type="button" data-ci-customer="'+ciEscape(member.id)+'">فتح الملف</button></article>').join('')||'<div class="empty">لا توجد عينات متاحة حاليًا.</div>')+
      '</div></div>'+
    '</div>'+
    '<div class="customer-intelligence-foot"><span>المصدر: بيانات العملاء والشرائح الحالية.</span><strong id="customer-intelligence-status">محدّث الآن</strong></div>';

  panel.querySelector('#customer-intelligence-refresh')?.addEventListener('click',()=>void loadCustomerIntelligence(true));
  panel.querySelectorAll('[data-ci-segment]').forEach(button=>button.addEventListener('click',()=>{
    const target=document.querySelector('[data-segment-key="'+CSS.escape(button.dataset.ciSegment)+'"]');
    if(target){target.click();return;}
    document.querySelector('#customer-segments-grid')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
  panel.querySelectorAll('[data-ci-customer]').forEach(button=>button.addEventListener('click',()=>{
    const target=document.querySelector('[data-customer-360="'+CSS.escape(button.dataset.ciCustomer)+'"]');
    if(target){target.click();return;}
    document.querySelector('#customers')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

async function loadCustomerIntelligence(showLoading=false){
  const section=document.querySelector('#customers');
  if(!section)return;
  const panel=document.querySelector('#customer-intelligence-panel');
  if(showLoading&&panel){
    const status=panel.querySelector('#customer-intelligence-status');
    if(status)status.textContent='جاري التحديث…';
  }
  const customers=Array.isArray(window.__ARABISK_CUSTOMERS__)?window.__ARABISK_CUSTOMERS__:[];
  const segments=Array.isArray(window.__ARABISK_CUSTOMER_SEGMENTS__)?window.__ARABISK_CUSTOMER_SEGMENTS__:[];
  if(customers.length||segments.length||window.__ARABISK_CUSTOMER_STATE_READY__){
    renderCustomerIntel({customers,segments});
    return;
  }
  try{
    const [customersData,segmentsData]=await Promise.all([
      customerIntelRequest('/api/customers'),
      customerIntelRequest('/api/revenue/customer-segments')
    ]);
    const resolvedCustomers=Array.isArray(customersData)?customersData:(Array.isArray(customersData.customers)?customersData.customers:[]);
    const resolvedSegments=Array.isArray(segmentsData?.segments)?segmentsData.segments:[];
    renderCustomerIntel({customers:resolvedCustomers,segments:resolvedSegments});
  }catch(error){
    if(panel){
      const status=panel.querySelector('#customer-intelligence-status');
      if(status)status.textContent=error.message;
    }
  }
}
window.addEventListener('arabisk:customer-state-updated',()=>{
  if(location.hash.replace('#','')==='customers')loadCustomerIntelligence();
});
document.addEventListener('DOMContentLoaded',()=>{
  const isCustomersSection=()=>location.hash.replace('#','')==='customers';
  if(isCustomersSection())setTimeout(()=>void loadCustomerIntelligence(),0);
  document.querySelector('[data-section="customers"]')?.addEventListener('click',()=>setTimeout(()=>void loadCustomerIntelligence(),0));
});
