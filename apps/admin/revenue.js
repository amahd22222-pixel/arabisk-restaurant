const revenueApiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
const revEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const revMoney=value=>'AED '+Number(value||0).toFixed(0);
const revPriority=(key,label)=>`<span class="rev-priority ${revEsc(key)}">${revEsc(label)}</span>`;
let revenueTaskBoardData={};
const taskBoardLabel={overdue:'متأخرة',escalated:'تصعيد مطلوب',in_progress:'قيد التنفيذ',today:'اليوم',doneToday:'أُنجزت اليوم'};
const taskBoardTime=iso=>iso?new Date(iso).toLocaleString('ar-AE',{dateStyle:'short',timeStyle:'short'}):'بدون موعد';
function renderRevenueActivityPanel(data){
  const panel=document.querySelector('#revenue-activity-panel');
  const title=document.querySelector('#revenue-activity-title');
  const body=document.querySelector('#revenue-activity-body');
  if(!panel||!title||!body)return;
  title.textContent=data?.title||'سجل نشاط المهمة';
  const items=Array.isArray(data?.activityLog)?data.activityLog:[];
  const labels={
    created:'تم إنشاء المهمة',
    assigned:'تم تعيين المسؤول',
    started:'بدأ التنفيذ',
    sla_updated:'تم تحديث الـSLA',
    task_updated:'تم تحديث المهمة',
    outcome_recorded:'تم تسجيل النتيجة'
  };
  const detailText=item=>{
    const d=item.details||{};
    const parts=[];
    if(d.owner)parts.push('المسؤول: '+d.owner);
    if(d.dueAt)parts.push('الاستحقاق: '+taskBoardTime(d.dueAt));
    if(d.outcome)parts.push('النتيجة: '+d.outcome);
    if(d.revenue&&Number(d.revenue)>0)parts.push('الإيراد: '+revMoney(d.revenue));
    if(d.orderId)parts.push('الطلب: '+d.orderId);
    if(d.previousOwner&&d.previousOwner!==d.owner)parts.push('السابق: '+d.previousOwner);
    return parts.join(' — ')||'تغيير تشغيلي مسجل.';
  };
  body.innerHTML=items.map(item=>'<article class="activity-item"><div class="activity-dot"></div><div><strong>'+revEsc(labels[item.type]||item.type)+'</strong><small>'+revEsc(item.actor||'لوحة الإيرادات')+' — '+revEsc(taskBoardTime(item.createdAt))+'</small><p>'+revEsc(detailText(item))+'</p></div></article>').join('')||'<div class="empty">لا يوجد سجل نشاط محفوظ لهذه المهمة حتى الآن.</div>';
  panel.hidden=false;
}
function renderRevenueTaskBoard(){
  const board=revenueTaskBoardData||{};
  const ownerFilter=document.querySelector('#revenue-task-owner-filter');
  const statusFilter=document.querySelector('#revenue-task-status-filter');
  const ownerValue=ownerFilter?.value||'';
  const statusValue=statusFilter?.value||'';
  const groups={overdue:board.overdue||[],inProgress:board.inProgress||[],today:board.today||[],doneToday:board.doneToday||[]};
  const ownerNames=[...new Set(Object.values(groups).flat().map(row=>String(row.owner||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
  if(ownerFilter){
    const current=ownerFilter.value;
    ownerFilter.innerHTML='<option value="">كل المسؤولين</option>'+ownerNames.map(name=>'<option value="'+revEsc(name)+'">'+revEsc(name)+'</option>').join('');
    ownerFilter.value=ownerNames.includes(current)?current:'';
  }
  const renderGroup=(key,rows)=>{
    const filtered=rows.filter(row=>(!ownerValue||String(row.owner||'')===ownerValue)&&(!statusValue||statusValue===key||(statusValue==='overdue'&&row.task?.key==='overdue')||(statusValue==='escalated'&&row.task?.key==='escalated')));
    const node=document.querySelector('#task-board-'+(key==='inProgress'?'inprogress':key==='doneToday'?'done':'today'));
    if(!node)return;
    node.innerHTML=filtered.map(row=>{
      const task=row.task||{};
      const owner=row.owner||'غير محدد';
      const due=taskBoardTime(row.dueAt);
      const late=task.overdueHours>0?' — تأخير '+Number(task.overdueHours)+'س':'';
      const controls=(row.status==='draft'
        ? (task.key==='unassigned'
          ? '<button class="small-action task-board-assign" data-task-action="assign" data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(row.owner||'')+'">تعيين</button>'
          : '<button class="small-action task-board-start" data-task-action="start" data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(row.owner||'')+'" data-due-at="'+revEsc(row.dueAt||'')+'">بدء التنفيذ</button><button class="small-action task-board-complete" data-task-action="complete" data-id="'+revEsc(row.id)+'">تسجيل النتيجة</button>')
        : '<span class="status on">مغلقة</span>')+'<button class="small-action task-board-history" data-task-action="history" data-id="'+revEsc(row.id)+'">سجل النشاط</button>';
      return '<article class="task-card '+revEsc(task.key||key)+'"><div class="task-card-top"><strong>'+revEsc(row.title)+'</strong><span>'+revEsc(task.label||taskBoardLabel[key]||key)+'</span></div><p>'+revEsc(row.message||row.executionNote||'مهمة تشغيلية في مركز الإيرادات.')+'</p><small>المسؤول: '+revEsc(owner)+'</small><small>الاستحقاق: '+revEsc(due+late)+'</small><div class="task-card-actions">'+controls+'</div></article>';
    }).join('')||'<div class="empty task-empty">لا توجد مهام في هذا القسم.</div>';
    const countNode=document.querySelector('#task-board-'+(key==='inProgress'?'inprogress':key==='doneToday'?'done':key)+'-count');
    if(countNode)countNode.textContent=String(filtered.length);
  };
  renderGroup('overdue',groups.overdue);
  renderGroup('inProgress',groups.inProgress);
  renderGroup('today',groups.today);
  renderGroup('doneToday',groups.doneToday);
  const dateNode=document.querySelector('#revenue-task-board-date');
  if(dateNode)dateNode.textContent=board.date?('اليوم: '+board.date):'اليوم';
}

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
    revenueTaskBoardData=campaigns.taskBoard||{};
    renderRevenueTaskBoard();
    setMetric('#rev-drafts',campaigns.counts?.drafts);setMetric('#rev-executed',campaigns.counts?.executed);setMetric('#rev-converted',campaigns.counts?.converted);setMetric('#rev-attributed-orders',campaigns.counts?.attributedOrders);
    setMetric('#rev-open-tasks',campaigns.counts?.openTasks);setMetric('#rev-in-progress-tasks',campaigns.counts?.inProgressTasks);setMetric('#rev-overdue-tasks',campaigns.counts?.overdueTasks);setMetric('#rev-escalated-tasks',campaigns.counts?.escalatedTasks);
    const measured=document.querySelector('#rev-measured-revenue');if(measured)measured.textContent=revMoney(campaigns.counts?.measuredRevenue);
    const taskLabels={unassigned:'غير مسندة',assigned:'مسندة',in_progress:'قيد التنفيذ',overdue:'متأخرة',escalated:'تصعيد مطلوب',done:'مكتملة'};
    const campaignRows=campaigns.recent||[];
    document.querySelector('#revenue-campaigns-body').innerHTML=campaignRows.map(row=>{
      const task=row.task||{};
      const dueAt=task.dueAt||row.dueAt||'';
      const dueText=dueAt?new Date(dueAt).toLocaleString('ar-AE',{dateStyle:'short',timeStyle:'short'}):'بدون موعد';
      const overdueText=task.overdueHours>0?' — متأخرة '+Number(task.overdueHours)+'س':' ';
      const taskKey=task.key||row.workflowStatus||'unassigned';
      const taskClass=taskKey;
      const taskLabel=taskLabels[taskKey]||taskKey;
      const owner=task.owner||row.owner||'غير محدد';
      const actionButtons=row.status==='draft' ? '<button class="small-action" data-campaign-task data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(task.owner||row.owner||'')+'" data-due-at="'+revEsc(dueAt)+'" type="button">'+(taskKey==='unassigned'?'تعيين + SLA':'تعديل المهمة')+'</button>'+(taskKey==='assigned' ? '<button class="small-action" data-campaign-start data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(owner==='غير محدد'?'':owner)+'" data-due-at="'+revEsc(dueAt)+'" type="button">بدء التنفيذ</button>' : '') : '';
      const outcomeButtons=row.status==='draft' ? '<button class="small-action" data-campaign-outcome="executed" data-id="'+revEsc(row.id)+'" type="button">تم التنفيذ</button><button class="small-action" data-campaign-outcome="converted" data-id="'+revEsc(row.id)+'" type="button">سجل التحول</button>' : '<span class="status on">تم تسجيل النتيجة</span>';
      return '<tr><td><strong>'+revEsc(row.id)+'</strong><small>'+revEsc(row.title)+'</small></td><td>'+revEsc({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت',ignored:'تم التجاهل'}[row.status]||row.status)+'</td><td><div class="task-meta"><span class="rev-task '+revEsc(taskClass)+'">'+revEsc(taskLabel)+'</span><strong>'+revEsc(owner)+'</strong><small>'+revEsc(dueText)+'</small></div></td><td class="price">'+(row.resultRevenue?revMoney(row.resultRevenue):'—')+'</td><td class="campaign-actions">'+(actionButtons||'—')+'</td><td>'+outcomeButtons+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="empty">لا توجد مسودات حتى الآن.</td></tr>';
    if(state)state.textContent=`آخر تحديث: ${new Date(data.generatedAt).toLocaleString('ar-AE')} — نافذة التحليل ${data.windowDays} يوم`;
  }catch(error){ if(state)state.textContent=error.message; }
}
document.querySelector('#revenue-task-board')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-task-action]'); if(!button)return;
  const action=button.dataset.taskAction;
  const id=button.dataset.id;
  button.disabled=true;
  try{
    if(action==='history'){
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/activity',{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر تحميل سجل النشاط.');
      renderRevenueActivityPanel(data);
      return;
    }
    if(action==='assign'){
      const owner=prompt('اكتب اسم المسؤول أو الدور:',button.dataset.owner||'');
      if(owner===null)return;
      const hoursInput=prompt('مدة الـSLA بالساعات من الآن:','24');
      if(hoursInput===null)return;
      const hours=Math.max(1,Math.min(720,Number(hoursInput)||24));
      const dueAt=new Date(Date.now()+hours*3600000).toISOString();
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,dueAt,workflowStatus:'assigned'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر تعيين المهمة.');
    }else if(action==='start'){
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:button.dataset.owner||'',dueAt:button.dataset.dueAt||'',workflowStatus:'in_progress'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر بدء التنفيذ.');
    }else if(action==='complete'){
      const outcome=prompt('اكتب النتيجة: executed للتنفيذ أو converted للتحول أو ignored للتجاهل.','executed');
      if(outcome===null)return;
      const normalized=String(outcome).trim().toLowerCase();
      if(!['executed','converted','ignored'].includes(normalized))throw new Error('النتيجة يجب أن تكون executed أو converted أو ignored.');
      const payload={outcome:normalized};
      if(normalized==='converted'){
        const revenue=prompt('قيمة الإيراد المرتبط بالتحول (AED):','0');
        if(revenue===null)return;
        payload.revenue=Number(revenue)||0;
        payload.orderId=prompt('رقم الطلب إن وجد:','')||'';
      }
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/outcome',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر تسجيل النتيجة.');
    }
    await loadRevenue();
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});
document.querySelector('#revenue-activity-close')?.addEventListener('click',()=>{const panel=document.querySelector('#revenue-activity-panel');if(panel)panel.hidden=true;});
document.querySelector('#revenue-task-owner-filter')?.addEventListener('change',renderRevenueTaskBoard);
document.querySelector('#revenue-task-status-filter')?.addEventListener('change',renderRevenueTaskBoard);
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
