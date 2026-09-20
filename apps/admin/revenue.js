const revenueApiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
const revEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const revMoney=value=>'AED '+Number(value||0).toFixed(0);
const revPriority=(key,label)=>`<span class="rev-priority ${revEsc(key)}">${revEsc(label)}</span>`;

async function loadRevenue(){
  const state=document.querySelector('#revenue-state');
  if(state)state.textContent='جارٍ تحليل فرص الإيراد…';
  const setMetric=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/summary',{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر تحميل بيانات الإيراد.');
    const f=data.funnel||{};
    const health=data.health||{};
    setMetric('#rev-health-score',health.score);
    const healthLabel=document.querySelector('#rev-health-label');if(healthLabel)healthLabel.textContent=health.label||'—';
    const leak=document.querySelector('#rev-biggest-leak');if(leak)leak.textContent=health.biggestLeak?.label||'لا توجد بيانات كافية';
    const leakRate=document.querySelector('#rev-leak-rate');if(leakRate)leakRate.textContent=health.biggestLeak?.lossRate!==null&&health.biggestLeak?.lossRate!==undefined?`${Number(health.biggestLeak.lossRate).toFixed(1)}% تسريب`:'';
    const set=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    set('#rev-menu',f.menuViews);set('#rev-item',f.itemViews);set('#rev-cart',f.addToCart);set('#rev-checkout',f.checkoutStarted);set('#rev-orders',f.completedOrders);
    set('#rev-abandoned',data.counts?.abandonedCarts);set('#rev-inactive',data.counts?.inactiveCustomers);set('#rev-reservations',data.counts?.upcomingReservations);set('#rev-actions-count',data.counts?.topActions);
    const potential=document.querySelector('#rev-potential');if(potential)potential.textContent=revMoney(data.potentialAbandonedRevenue);

    const alerts=data.alerts||{};
    const alertSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    alertSet('#alerts-high',`${Number(alerts.high||0)} عالي`);
    alertSet('#alerts-medium',`${Number(alerts.medium||0)} متوسط`);
    alertSet('#alerts-low',`${Number(alerts.low||0)} منخفض`);
    const alertSeverity={high:'عالي',medium:'متوسط',low:'منخفض'};
    document.querySelector('#revenue-alerts-list').innerHTML=(alerts.items||[]).map(item=>`<article class="revenue-alert ${revEsc(item.severity)}"><div class="revenue-alert-top"><strong>${revEsc(item.title)}</strong><span>${revEsc(alertSeverity[item.severity]||item.severity)}</span></div><p>${revEsc(item.detail)}</p><small>${revEsc(item.action)}</small><button class="small-action alert-action-btn" data-alert-action="${revEsc(item.key)}" type="button">إنشاء مهمة تشغيلية</button></article>`).join('')||'<div class="empty">لا توجد تنبيهات تشغيلية حاليًا.</div>';

    const forecast=data.forecast||{};
    const forecastSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    forecastSet('#forecast-actual-14',revMoney(forecast.actual?.revenue14));
    forecastSet('#forecast-daily',revMoney(forecast.runRate?.blendedDaily));
    forecastSet('#forecast-7',revMoney(forecast.next7Days));
    forecastSet('#forecast-30',revMoney(forecast.next30Days));
    forecastSet('#forecast-trend',forecast.trendLabel||'—');
    forecastSet('#forecast-trend-rate',forecast.trendRate===null||forecast.trendRate===undefined?'':`${Number(forecast.trendRate).toFixed(1)}%`);
    forecastSet('#forecast-orders',`الطلبات: ${Number(forecast.actual?.orders14||0)} خلال 14 يومًا / ${Number(forecast.actual?.orders30||0)} خلال 30 يومًا`);
    forecastSet('#forecast-opportunity',`الفرص المفتوحة: ${revMoney(forecast.openOpportunityValue)} — لا تدخل التوقع الأساسي.`);
    forecastSet('#forecast-note',forecast.note||'تقدير تشغيلي من البيانات المسجلة.');

    const intelligence=data.intelligence||{};
    const intelSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    intelSet('#intel-potential',revMoney(intelligence.totals?.potentialAbandonedRevenue));
    intelSet('#intel-measured',revMoney(intelligence.totals?.measuredRevenue));
    intelSet('#intel-orders',intelligence.totals?.attributedOrders);
    intelSet('#intel-converted',intelligence.totals?.convertedActions);
    const segRows=intelligence.segmentPerformance||[];
    document.querySelector('#intel-segments-body').innerHTML=segRows.map(row=>`<tr><td><strong>${revEsc(row.label)}</strong></td><td>${Number(row.audience||0)}</td><td>${Number(row.executed||0)}</td><td>${Number(row.converted||0)} <small>${Number(row.conversionRate||0).toFixed(1)}%</small></td><td>${Number(row.attributedOrders||0)}</td><td class="price">${revMoney(row.measuredRevenue)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">لا توجد بيانات أداء للشرائح حتى الآن.</td></tr>';
    const measuredRows=intelligence.measuredActions||[];
    document.querySelector('#intel-actions-body').innerHTML=measuredRows.map(row=>`<tr><td><strong>${revEsc(row.title)}</strong><small>${revEsc(row.id)}</small></td><td class="price">${revMoney(row.revenue)}</td><td>${row.orderId?revEsc(row.orderId):'—'}</td><td>${row.matchedOrder?'<span class="status on">طلب فعلي</span>':'<span class="status pending">يدوي</span>'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لم يتم تسجيل إيراد من إجراءات بعد.</td></tr>';
    const nextActions=intelligence.nextActions||[];
    document.querySelector('#intel-next-actions').innerHTML=nextActions.map(row=>`<div class="intelligence-action"><strong>${revEsc(row.priority||'—')}</strong><span>${revEsc(row.title)}</span><small>${revEsc(row.recommendedAction||row.reason)}</small></div>`).join('')||'<div class="empty">لا توجد أولوية تنفيذية حالية.</div>';

    const measurement=data.measurement||{};
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
    setMetric('#rev-drafts',campaigns.counts?.drafts);setMetric('#rev-executed',campaigns.counts?.executed);setMetric('#rev-converted',campaigns.counts?.converted);setMetric('#rev-attributed-orders',campaigns.counts?.attributedOrders);
    setMetric('#rev-open-tasks',campaigns.counts?.openTasks);setMetric('#rev-in-progress-tasks',campaigns.counts?.inProgressTasks);setMetric('#rev-overdue-tasks',campaigns.counts?.overdueTasks);
    const measured=document.querySelector('#rev-measured-revenue');if(measured)measured.textContent=revMoney(campaigns.counts?.measuredRevenue);
    const taskLabels={unassigned:'غير مسندة',assigned:'مسندة',in_progress:'قيد التنفيذ',overdue:'متأخرة',done:'مكتملة'};
    const campaignRows=campaigns.recent||[];
    document.querySelector('#revenue-campaigns-body').innerHTML=campaignRows.map(row=>{
      const task=row.task||{};
      const dueAt=task.dueAt||row.dueAt||'';
      const dueText=dueAt?new Date(dueAt).toLocaleString('ar-AE',{dateStyle:'short',timeStyle:'short'}):'بدون موعد';
      const taskKey=task.key||row.workflowStatus||'unassigned';
      const taskClass=taskKey==='overdue'?'overdue':taskKey;
      const taskLabel=taskLabels[taskKey]||taskKey;
      const owner=task.owner||row.owner||'غير محدد';
      const actionButtons=row.status==='draft' ? '<button class="small-action" data-campaign-task data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(task.owner||row.owner||'')+'" data-due-at="'+revEsc(dueAt)+'" type="button">'+(taskKey==='unassigned'?'تعيين + SLA':'تعديل المهمة')+'</button>'+(taskKey==='assigned' ? '<button class="small-action" data-campaign-start data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(owner==='غير محدد'?'':owner)+'" data-due-at="'+revEsc(dueAt)+'" type="button">بدء التنفيذ</button>' : '') : '';
      const outcomeButtons=row.status==='draft' ? '<button class="small-action" data-campaign-outcome="executed" data-id="'+revEsc(row.id)+'" type="button">تم التنفيذ</button><button class="small-action" data-campaign-outcome="converted" data-id="'+revEsc(row.id)+'" type="button">سجل التحول</button>' : '<span class="status on">تم تسجيل النتيجة</span>';
      return '<tr><td><strong>'+revEsc(row.id)+'</strong><small>'+revEsc(row.title)+'</small></td><td>'+revEsc({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت',ignored:'تم التجاهل'}[row.status]||row.status)+'</td><td><div class="task-meta"><span class="rev-task '+revEsc(taskClass)+'">'+revEsc(taskLabel)+'</span><strong>'+revEsc(owner)+'</strong><small>'+revEsc(dueText)+'</small></div></td><td class="price">'+(row.resultRevenue?revMoney(row.resultRevenue):'—')+'</td><td class="campaign-actions">'+(actionButtons||'—')+'</td><td>'+outcomeButtons+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="empty">لا توجد مسودات حتى الآن.</td></tr>';
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
  const taskButton=event.target.closest('[data-campaign-task]');
  if(taskButton){
    const owner=prompt('اكتب اسم المسؤول أو الدور المسؤول عن المهمة:',taskButton.dataset.owner||'');
    if(owner===null)return;
    const hoursInput=prompt('مدة الـSLA بالساعات من الآن:','24');
    if(hoursInput===null)return;
    const hours=Math.max(1,Math.min(720,Number(hoursInput)||24));
    const dueAt=new Date(Date.now()+hours*3600000).toISOString();
    taskButton.disabled=true;
    try{
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(taskButton.dataset.id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,dueAt,workflowStatus:'assigned'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر تعيين المهمة.');
      await loadRevenue();
    }catch(error){alert(error.message)}finally{taskButton.disabled=false;}
    return;
  }
  const startButton=event.target.closest('[data-campaign-start]');
  if(startButton){
    startButton.disabled=true;
    try{
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(startButton.dataset.id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:startButton.dataset.owner||'',dueAt:startButton.dataset.dueAt||'',workflowStatus:'in_progress'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر بدء المهمة.');
      await loadRevenue();
    }catch(error){alert(error.message)}finally{startButton.disabled=false;}
    return;
  }
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

document.querySelector('#revenue-alerts-list')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-alert-action]'); if(!button)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/campaign-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'alert_action',reference:button.dataset.alertAction})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر إنشاء المهمة.');
    button.textContent='تم إنشاء المهمة';
    await loadRevenue();
  }catch(error){alert(error.message);button.disabled=false;}
});
