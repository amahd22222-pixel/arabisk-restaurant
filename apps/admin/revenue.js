const revenueApiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
const revEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const revMoney=value=>'AED '+Number(value||0).toFixed(0);
const revPriority=(key,label)=>`<span class="rev-priority ${revEsc(key)}">${revEsc(label)}</span>`;

async function loadRevenue(){
  const state=document.querySelector('#revenue-state');
  if(state)state.textContent='جارٍ تحليل فرص الإيراد…';
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/summary',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر تحميل بيانات الإيراد.');
    const f=data.funnel||{};
    const set=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    set('#rev-menu',f.menuViews);set('#rev-item',f.itemViews);set('#rev-cart',f.addToCart);set('#rev-checkout',f.checkoutStarted);set('#rev-orders',f.completedOrders);
    set('#rev-abandoned',data.counts?.abandonedCarts);set('#rev-inactive',data.counts?.inactiveCustomers);set('#rev-reservations',data.counts?.upcomingReservations);set('#rev-actions-count',data.counts?.topActions);
    const potential=document.querySelector('#rev-potential');if(potential)potential.textContent=revMoney(data.potentialAbandonedRevenue);

    const measurement=data.measurement||{};
    const setMetric=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    setMetric('#rev-intent-sessions',measurement.intentSessions);
    setMetric('#rev-intent-conversions',measurement.intentConversions);
    setMetric('#rev-intent-rate',`${Number(measurement.intentConversionRate||0).toFixed(1)}%`);
    const attributed=document.querySelector('#rev-intent-revenue');if(attributed)attributed.textContent=revMoney(measurement.attributedIntentRevenue);
    const note=document.querySelector('#rev-attribution-note');if(note)note.textContent=measurement.attributionNote||'قياس ارتباطي فقط، وليس إثباتًا سببيًا.';

    const actions=data.topActions||[];
    document.querySelector('#revenue-actions-body').innerHTML=actions.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)}</td><td><strong>${revEsc(row.title)}</strong><small>${revEsc(row.reason)}</small></td><td>${revEsc(row.recommendedAction)}</td><td class="price">${row.potentialValue?revMoney(row.potentialValue):'—'}</td><td><button class="small-action" data-create-draft data-type="${revEsc(row.type)}" data-reference="${revEsc(row.reference)}" type="button">إنشاء مسودة</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد إجراءات مقترحة حاليًا.</td></tr>';

    const abandoned=data.opportunities?.abandonedCarts||[];
    document.querySelector('#revenue-abandoned-body').innerHTML=abandoned.map(row=>`<tr><td><strong>${revEsc(row.sessionId.slice(0,12))}</strong><small>${new Date(row.lastActivityAt).toLocaleString('ar-AE')}</small></td><td>${revEsc(row.productId||'—')}</td><td>${revPriority(row.priorityKey,row.priority)}</td><td class="price">${revMoney(row.cartValue)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد سلات متروكة مؤهلة حاليًا.</td></tr>';

    const inactive=data.opportunities?.inactiveCustomers||[];
    document.querySelector('#revenue-inactive-body').innerHTML=inactive.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name||'عميل')}</strong><small dir="ltr">${revEsc(row.phone||'')}</small></td><td>${Number(row.orderCount||0)}</td><td>${Number(row.daysSinceLastOrder||0)} يوم</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد فرص إعادة تنشيط حاليًا.</td></tr>';

    const upcoming=data.opportunities?.upcomingReservations||[];
    document.querySelector('#revenue-reservation-body').innerHTML=upcoming.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name)}</strong><small dir="ltr">${revEsc(row.phone)}</small></td><td>${revEsc(row.date)}<small>${revEsc(row.time)}</small></td><td>${Number(row.guests||0)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد حجوزات خلال 48 ساعة.</td></tr>';
    const campaigns=data.campaigns||{};
    setMetric('#rev-drafts',campaigns.counts?.drafts);setMetric('#rev-executed',campaigns.counts?.executed);setMetric('#rev-converted',campaigns.counts?.converted);
    const measured=document.querySelector('#rev-measured-revenue');if(measured)measured.textContent=revMoney(campaigns.counts?.measuredRevenue);
    const campaignRows=campaigns.recent||[];
    document.querySelector('#revenue-campaigns-body').innerHTML=campaignRows.map(row=>`<tr><td><strong>${revEsc(row.id)}</strong><small>${revEsc(row.title)}</small></td><td>${revEsc({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت',ignored:'تم التجاهل'}[row.status]||row.status)}</td><td class="price">${row.resultRevenue?revMoney(row.resultRevenue):'—'}</td><td><button class="small-action" data-campaign-outcome="executed" data-id="${revEsc(row.id)}" type="button">تم التنفيذ</button><button class="small-action" data-campaign-outcome="converted" data-id="${revEsc(row.id)}" type="button">سجل التحول</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد مسودات حتى الآن.</td></tr>';
    if(state)state.textContent=`آخر تحديث: ${new Date(data.generatedAt).toLocaleString('ar-AE')} — نافذة التحليل ${data.windowDays} يوم`;
  }catch(error){ if(state)state.textContent=error.message; }
}
document.querySelector('#revenue-refresh')?.addEventListener('click',()=>void loadRevenue());
document.querySelector('[data-section="revenue"]')?.addEventListener('click',()=>void loadRevenue());
void loadRevenue();

document.querySelector('#revenue-actions-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-create-draft]'); if(!button)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/campaign-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:button.dataset.type,reference:button.dataset.reference})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||'تعذر إنشاء المسودة.');
    alert('تم إنشاء المسودة. لا يوجد إرسال تلقائي في هذه النسخة.');
    await loadRevenue();
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});
document.querySelector('#revenue-campaigns-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-campaign-outcome]'); if(!button)return;
  const outcome=button.dataset.campaignOutcome;
  const payload={outcome};
  if(outcome==='converted'){
    const revenue=prompt('أدخل قيمة الإيراد المرتبط بالتحول (AED):','0');
    if(revenue===null)return;
    payload.revenue=Number(revenue)||0;
    payload.orderId=prompt('أدخل رقم الطلب إن وجد:','')||'';
  }
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+`/api/revenue/campaigns/${encodeURIComponent(button.dataset.id)}/outcome`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر حفظ النتيجة.');
    await loadRevenue();
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});
