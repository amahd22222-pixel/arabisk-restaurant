const RCC_IDS=['rev-potential','rev-returning','rev-abandoned','rev-actions-count','intel-measured','intel-orders','rev-open-tasks','rev-overdue-tasks'];
const rccValue=id=>document.getElementById(id)?.textContent?.trim()||'0';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const rccStatusLabel={draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت إلى طلب',ignored:'تم التجاهل'};
const rccMoney=value=>'AED '+Number(value||0).toFixed(0);

function rccCard(label,value,id,accent=''){
  return '<article class="rcc-kpi '+accent+'" data-source="'+id+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></article>';
}

function buildCommandCenter(){
  const revenue=document.getElementById('revenue');
  if(!revenue || document.getElementById('revenue-command-center')) return;
  const panel=document.createElement('div');
  panel.id='revenue-command-center';
  panel.className='revenue-command-center';
  panel.innerHTML=
    '<div class="rcc-head">'+
      '<div><span class="rcc-eyebrow">ARABISK REVENUE OPERATIONS</span><h2>مركز القرار</h2><p>ملخص تشغيلي سريع: ماذا لدينا الآن، وما الذي يحتاج إجراءً، وما الذي تم قياسه.</p></div>'+
      '<button type="button" class="small-action" id="rcc-focus-actions">فتح الإجراءات</button>'+
    '</div>'+
    '<div class="rcc-kpis">'+
      rccCard('قيمة الفرص الحالية','AED 0','rev-potential','rcc-value')+
      rccCard('فرص حان موعد عودتها','0','rev-returning')+
      rccCard('سلات متروكة','0','rev-abandoned')+
      rccCard('تحتاج إجراءً','0','rev-actions-count','rcc-alert')+
      rccCard('إيراد مقاس','AED 0','intel-measured','rcc-success')+
      rccCard('طلبات مربوطة','0','intel-orders')+
      rccCard('مهام مفتوحة','0','rev-open-tasks')+
      rccCard('مهام متأخرة','0','rev-overdue-tasks','rcc-alert')+
    '</div>'+
    '<div class="rcc-workflow">'+
      '<button type="button" data-target="revenue-actions"><b>01</b><span>اكتشف</span><small>الفرص الحالية</small></button><i>←</i>'+
      '<button type="button" data-target="revenue-campaigns"><b>02</b><span>نفّذ</span><small>الإجراءات والمهام</small></button><i>←</i>'+
      '<button type="button" data-target="revenue-value-realization"><b>03</b><span>قِس</span><small>القيمة المتحققة</small></button><i>←</i>'+
      '<button type="button" data-target="revenue-outcome-learning"><b>04</b><span>تعلّم</span><small>نتائج الإجراءات</small></button>'+
    '</div>'+
    '<div class="rcc-priority" id="rcc-priority"><div><strong>الأولوية الآن</strong><span id="rcc-priority-text">جارٍ قراءة حالة التشغيل…</span></div><button type="button" class="small-action" id="rcc-open-priority">انتقال</button></div>'+
    '<section class="rcc-linked" aria-label="الإجراءات المرتبطة"><div class="rcc-linked-head"><div><span>LINKED OPERATIONS</span><h3>الإجراء ↔ العميل ↔ الطلب</h3><small>تنقل مباشر من الإجراء إلى سياق العميل والطلب المرتبط، بدون البحث اليدوي.</small></div><strong id="rcc-linked-count">0 إجراء</strong></div><div class="rcc-link-list" id="rcc-link-list"><div class="empty">لم يتم تحميل الإجراءات بعد.</div></div></section>';
  const first=revenue.querySelector('.panelhead');
  revenue.insertBefore(panel,first||revenue.firstChild);

  panel.querySelector('#rcc-focus-actions').addEventListener('click',()=>rccScroll('revenue-actions'));
  panel.querySelector('#rcc-open-priority').addEventListener('click',()=>{
    const target=panel.dataset.priorityTarget||'revenue-actions';
    rccScroll(target);
  });
  panel.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>rccScroll(button.dataset.target)));
  panel.addEventListener('click',handleRccLinks);
}

function rccScroll(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({behavior:'smooth',block:'start'});
  el.classList.remove('rcc-focus');
  void el.offsetWidth;
  el.classList.add('rcc-focus');
  setTimeout(()=>el.classList.remove('rcc-focus'),1200);
}

function renderLinkedOperations(){
  const panel=document.getElementById('revenue-command-center');
  const list=document.getElementById('rcc-link-list');
  const count=document.getElementById('rcc-linked-count');
  if(!panel||!list)return;
  const campaigns=Array.isArray(window.__ARABISK_REVENUE_CAMPAIGNS__)?window.__ARABISK_REVENUE_CAMPAIGNS__:[];
  const rows=campaigns.slice(0,6);
  if(count)count.textContent=campaigns.length+' إجراء';
  let html='<div class="empty">لا توجد إجراءات مرتبطة حاليًا.</div>';
  if(rows.length){
    html=rows.map(row=>{
      const orderId=row.attribution?.orderId||row.orderId||'';
      const customerId=row.customerId||'';
      const customerName=row.customerName||'عميل غير محدد';
      const status=rccStatusLabel[row.status]||row.status||'غير محدد';
      const task=row.task||{};
      const taskLabel=task.label||task.key||row.workflowStatus||'غير مسندة';
      const customerChip=customerId?'<span class="rcc-context-chip customer">'+esc(customerName)+'</span>':'<span class="rcc-context-chip muted">بدون عميل</span>';
      const orderChip=orderId?'<span class="rcc-context-chip order" dir="ltr">#'+esc(orderId)+'</span>':'<span class="rcc-context-chip muted">بدون طلب</span>';
      return '<article class="rcc-link-item"><div class="rcc-link-main"><div class="rcc-link-title"><strong>'+esc(row.title||'إجراء إيرادات')+'</strong><small dir="ltr">'+esc(row.id||'')+'</small></div><div class="rcc-link-meta"><span>'+esc(status)+'</span><span>'+esc(taskLabel)+'</span><b>'+rccMoney(row.resultRevenue||0)+'</b></div><div class="rcc-link-context">'+customerChip+orderChip+'</div></div><div class="rcc-link-actions"><button type="button" class="small-action" data-rcc-open-campaign="'+esc(row.id||'')+'">فتح الإجراء</button>'+(customerId?'<button type="button" class="small-action" data-rcc-open-customer="'+esc(customerId)+'">فتح العميل</button>':'')+(orderId?'<button type="button" class="small-action" data-rcc-open-order="'+esc(orderId)+'">فتح الطلب</button>':'')+'</div></article>';
    }).join('');
  }
  if(list.innerHTML!==html)list.innerHTML=html;
}

function handleRccLinks(event){
  const campaignButton=event.target.closest('[data-rcc-open-campaign]');
  if(campaignButton){
    const id=campaignButton.dataset.rccOpenCampaign||'';
    const row=document.querySelector('[data-campaign-id="'+CSS.escape(id)+'"]');
    if(!row){rccScroll('revenue-campaigns');return;}
    const detail=row.querySelector('[data-campaign-detail]');
    if(detail){detail.click();return;}
    row.classList.add('customer360-highlight-row');
    row.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>row.classList.remove('customer360-highlight-row'),2200);
    return;
  }
  const customerButton=event.target.closest('[data-rcc-open-customer]');
  if(customerButton){
    const id=customerButton.dataset.rccOpenCustomer||'';
    const target=document.querySelector('[data-customer-context="'+CSS.escape(id)+'"]')||document.querySelector('[data-customer-360="'+CSS.escape(id)+'"]');
    if(target){target.click();return;}
    document.querySelector('[data-section="customers"]')?.click();
    return;
  }
  const orderButton=event.target.closest('[data-rcc-open-order]');
  if(orderButton){
    const id=orderButton.dataset.rccOpenOrder||'';
    document.querySelector('[data-section="orders"]')?.click();
    setTimeout(()=>{
      const row=document.querySelector('select[data-order-status="'+CSS.escape(id)+'"]')?.closest('tr');
      if(row){
        row.classList.add('customer360-highlight-row');
        row.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>row.classList.remove('customer360-highlight-row'),2200);
      }else{
        alert('الطلب المرتبط غير موجود في لوحة الطلبات الحالية.');
      }
    },100);
  }
}

function updateCommandCenter(){
  const panel=document.getElementById('revenue-command-center');
  if(!panel)return;
  panel.querySelectorAll('.rcc-kpi[data-source]').forEach(card=>{
    const value=rccValue(card.dataset.source);
    const strong=card.querySelector('strong');
    if(strong&&strong.textContent!==value)strong.textContent=value;
  });
  renderLinkedOperations();
  const actions=Number.parseInt(rccValue('rev-actions-count'),10)||0;
  const overdue=Number.parseInt(rccValue('rev-overdue-tasks'),10)||0;
  const returning=Number.parseInt(rccValue('rev-returning'),10)||0;
  let text='التشغيل مستقر — راقب النتائج المسجلة.';
  let target='revenue-outcome-learning';
  if(overdue>0){text='لديك '+overdue+' مهمة متأخرة تحتاج متابعة قبل إضافة عمل جديد.';target='revenue-task-board';}
  else if(actions>0){text='هناك '+actions+' فرصة تحتاج إجراءً. ابدأ من قائمة الإجراءات.';target='revenue-actions';}
  else if(returning>0){text='هناك '+returning+' فرصة لعملاء حان موعد عودتهم.';target='revenue-returning-body';}
  const label=panel.querySelector('#rcc-priority-text');
  if(label&&label.textContent!==text)label.textContent=text;
  panel.dataset.priorityTarget=target;
}

function boot(){
  buildCommandCenter();
  updateCommandCenter();
  const revenue=document.getElementById('revenue');
  if(!revenue)return;
  const observer=new MutationObserver(()=>updateCommandCenter());
  observer.observe(revenue,{subtree:true,childList:true,characterData:true});
  setTimeout(()=>observer.disconnect(),180000);
  setInterval(updateCommandCenter,3000);
  window.addEventListener('arabisk:revenue-state-updated',updateCommandCenter);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
