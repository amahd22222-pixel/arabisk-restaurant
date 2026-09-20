const revenueBlockerTypes=[['customer_response','انتظار رد العميل'],['owner_unavailable','المسؤول غير متاح'],['approval','انتظار موافقة'],['inventory','المخزون / توفر المنتج'],['pricing','السعر / العرض يحتاج تعديل'],['technical','مشكلة تقنية'],['dependency','اعتماد على مهمة أو طرف آخر'],['capacity','القدرة التشغيلية غير كافية'],['other','عائق آخر']];
const revenueBlockerTypeLabel=key=>revenueBlockerTypes.find(item=>item[0]===key)?.[1]||'عائق آخر';
async function promptRevenueBlocker(id){
  const row=revenueTaskById(id)||{};
  const menu=revenueBlockerTypes.map((item,index)=>(index+1)+'. '+item[1]).join('\n');
  const answer=prompt('اختر نوع العائق:\n'+menu,'1');
  if(answer===null)return false;
  const type=revenueBlockerTypes[Number(answer)-1]?.[0]||null;
  if(!type)throw new Error('يجب اختيار نوع عائق صحيح.');
  const reason=prompt('اكتب وصف العائق بالتفصيل:',row.blockerReason||'');
  if(reason===null)return false;
  if(!reason.trim())throw new Error('يجب تسجيل وصف للعائق.');
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:row.owner||'',dueAt:row.dueAt||'',workflowStatus:'blocked',blockerType:type,blockerReason:reason.trim(),notes:row.taskNotes||''})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر حجب المهمة.');
  return true;
}
const revenueIgnoredReasons=[['customer_unresponsive','لم يرد العميل'],['not_interested','غير مهتم'],['not_relevant','العرض غير مناسب'],['operational_issue','عائق تشغيلي'],['timing','التوقيت غير مناسب'],['duplicate','مكرر / تمت معالجته سابقًا'],['other','سبب آخر']];
const revenueOutcomeReasonLabel=key=>({converted_to_order:'تحول إلى طلب فعلي',manual_conversion:'تحول مسجل يدويًا',completed_no_conversion:'تم التنفيذ بدون تحول',customer_unresponsive:'لم يرد العميل',not_interested:'غير مهتم',not_relevant:'العرض غير مناسب',operational_issue:'عائق تشغيلي',timing:'التوقيت غير مناسب',duplicate:'مكرر / تمت معالجته سابقًا',other:'سبب آخر',unclassified:'غير مصنف'}[key]||'غير مصنف');
function promptRevenueOutcomeReason(outcome){
  if(outcome==='executed')return 'completed_no_conversion';
  if(outcome!=='ignored')return '';
  const menu=revenueIgnoredReasons.map((item,index)=>(index+1)+'. '+item[1]).join('\n');
  const answer=prompt('اختر سبب عدم التحول:\n'+menu,'1');
  if(answer===null)return null;
  return revenueIgnoredReasons[Number(answer)-1]?.[0]||null;
}
async function submitRevenueOutcome(id,outcomePreset=''){
  const outcome=outcomePreset||prompt('اكتب النتيجة: executed أو converted أو ignored.','executed');
  if(outcome===null)return false;
  const normalized=String(outcome).trim().toLowerCase();
  if(!['executed','converted','ignored'].includes(normalized))throw new Error('النتيجة يجب أن تكون executed أو converted أو ignored.');
  const payload={outcome:normalized};
  if(normalized==='converted'){
    const revenue=prompt('قيمة الإيراد المرتبط بالتحول (AED):','0');
    if(revenue===null)return false;
    payload.revenue=Number(revenue)||0;
    payload.orderId=prompt('رقم الطلب إن وجد:','')||'';
    payload.outcomeReason=payload.orderId?'converted_to_order':'manual_conversion';
  }else{
    const reason=promptRevenueOutcomeReason(normalized);
    if(!reason)throw new Error('لم يتم تحديد سبب النتيجة.');
    payload.outcomeReason=reason;
  }
  const note=prompt('ملاحظة مختصرة اختيارية للنتيجة:','');
  if(note===null)return false;
  if(note.trim())payload.outcomeReasonNote=note.trim();
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/outcome',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر تسجيل النتيجة.');
  return true;
}
const revenueApiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
const revEsc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const revMoney=value=>'AED '+Number(value||0).toFixed(0);
const revPriority=(key,label)=>`<span class="rev-priority ${revEsc(key)}">${revEsc(label)}</span>`;
let revenueTaskBoardData={};
let revenueCampaignsData=[];
const taskBoardLabel={blocked:'محجوبة',overdue:'متأخرة',escalated:'تصعيد مطلوب',in_progress:'قيد التنفيذ',today:'اليوم',doneToday:'أُنجزت اليوم'};
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
    outcome_recorded:'تم تسجيل النتيجة',
    blocked:'تم حجب المهمة',
    unblocked:'تم حل العائق وإعادة المهمة'
  };
  const detailText=item=>{
    const d=item.details||{};
    const parts=[];
    if(d.owner)parts.push('المسؤول: '+d.owner);
    if(d.dueAt)parts.push('الاستحقاق: '+taskBoardTime(d.dueAt));
    if(d.outcome)parts.push('النتيجة: '+d.outcome);
    if(d.revenue&&Number(d.revenue)>0)parts.push('الإيراد: '+revMoney(d.revenue));
    if(d.orderId)parts.push('الطلب: '+d.orderId);
    if(d.blockerType)parts.push('نوع العائق: '+d.blockerType);if(d.blockerReason)parts.push('العائق: '+d.blockerReason);
    if(d.previousOwner&&d.previousOwner!==d.owner)parts.push('السابق: '+d.previousOwner);
    return parts.join(' — ')||'تغيير تشغيلي مسجل.';
  };
  body.innerHTML=items.map(item=>'<article class="activity-item"><div class="activity-dot"></div><div><strong>'+revEsc(labels[item.type]||item.type)+'</strong><small>'+revEsc(item.actor||'لوحة الإيرادات')+' — '+revEsc(taskBoardTime(item.createdAt))+'</small><p>'+revEsc(detailText(item))+'</p></div></article>').join('')||'<div class="empty">لا يوجد سجل نشاط محفوظ لهذه المهمة حتى الآن.</div>';
  panel.hidden=false;
}
function revenueTaskById(id){
  return revenueCampaignsData.find(row=>row.id===id)||null;
}
function renderRevenueTaskDetail(row,activity=[]){
  const modal=document.querySelector('#revenue-task-detail-modal');
  const body=document.querySelector('#revenue-task-detail-body');
  if(!modal||!body||!row)return;
  const task=row.task||{};
  const owner=row.owner||'غير محدد';
  const due=taskBoardTime(row.dueAt||row.dueAt);
  const statusLabel={draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت',ignored:'تم التجاهل'}[row.status]||row.status||'—';
  const outcomeLabel=row.status==='converted'?'تحول':row.status==='executed'?'تم التنفيذ':row.status==='ignored'?'تجاهل':'مفتوحة';
  const source=row.sourceType||row.type||'—';
  const attribution=row.attribution||{};
  const resultRevenue=Number(row.resultRevenue||0)>0?revMoney(row.resultRevenue):'—';
  const activityLabels={created:'تم إنشاء المهمة',assigned:'تم تعيين المسؤول',started:'بدأ التنفيذ',sla_updated:'تم تحديث الـSLA',task_updated:'تم تحديث المهمة',blocked:'تم حجب المهمة',unblocked:'تم حل العائق وإعادة المهمة',outcome_recorded:'تم تسجيل النتيجة'};
  const activityHtml=(Array.isArray(activity)?activity:[]).slice().reverse().map(item=>{
    const d=item.details||{};
    const bits=[];
    if(d.owner)bits.push('المسؤول: '+d.owner);
    if(d.dueAt)bits.push('SLA: '+taskBoardTime(d.dueAt));
    if(d.outcome)bits.push('النتيجة: '+d.outcome);
    if(Number(d.revenue)>0)bits.push('الإيراد: '+revMoney(d.revenue));
    if(d.orderId)bits.push('الطلب: '+d.orderId);
    if(d.blockerType)bits.push('نوع العائق: '+d.blockerType);if(d.blockerReason)bits.push('العائق: '+d.blockerReason);
    return '<article class="revenue-detail-activity"><strong>'+revEsc(activityLabels[item.type]||item.type)+'</strong><small>'+revEsc(item.actor||'لوحة الإيرادات')+' — '+revEsc(taskBoardTime(item.createdAt))+'</small><p>'+revEsc(bits.join(' — ')||'تغيير تشغيلي مسجل.')+'</p></article>';
  }).join('')||'<div class="empty">لا يوجد سجل نشاط لهذه المهمة حتى الآن.</div>';
  const riskClass=task.riskKey||'low';
  body.innerHTML='<div class="revenue-detail-head"><div><span class="rev-task '+revEsc(task.key||'unassigned')+'">'+revEsc(task.label||'مفتوحة')+'</span><h3>'+revEsc(row.title||'مهمة إيرادات')+'</h3><small>'+revEsc(row.id||'')+'</small></div><div class="revenue-detail-value"><span>قيمة الفرصة</span><strong>'+revMoney(row.potentialValue||0)+'</strong></div></div>'+
    '<div class="revenue-detail-grid"><article><span>المسؤول</span><strong>'+revEsc(owner)+'</strong></article><article><span>الـSLA</span><strong>'+revEsc(due)+'</strong></article><article><span>الحالة</span><strong>'+revEsc(statusLabel)+' — '+revEsc(outcomeLabel)+'</strong></article><article><span>المصدر</span><strong>'+revEsc(source)+'</strong></article><article><span>الإيراد المقاس</span><strong>'+resultRevenue+'</strong></article><article><span>الطلب المربوط</span><strong>'+revEsc(attribution.orderId||row.orderId||'—')+'</strong></article><article><span>سبب النتيجة</span><strong>'+revEsc(row.outcomeReasonLabel||revenueOutcomeReasonLabel(row.outcomeReason)||'غير مصنف')+'</strong></article></div>'+
    '<div class="revenue-detail-risk '+riskClass+'"><div><span>مخاطرة التشغيل</span><strong>'+revEsc(task.riskLabel||'—')+'</strong></div><b>'+Number(task.riskScore||0)+'/100</b><p>'+revEsc(task.nextAction||'تابع المهمة وسجّل النتيجة عند الإغلاق.')+'</p></div>'+
    '<div class="revenue-detail-note"><span>إجراء التنفيذ</span><p>'+revEsc(row.executionNote||row.message||'مهمة تشغيلية داخل مركز الإيرادات.')+'</p></div>'+(task.key==='blocked' ? '<div class="revenue-detail-blocker"><span>نوع العائق</span><strong>'+revEsc(task.blockerTypeLabel||revenueBlockerTypeLabel(row.blockerType||'other'))+'</strong><span>العائق التشغيلي</span><strong>'+revEsc(task.blockerReason||row.blockerReason||'غير محدد')+'</strong></div>' : '')+
    (row.status==='draft' ? '<div class="revenue-detail-operator-note"><label>ملاحظات تشغيلية<textarea id="revenue-detail-task-note" rows="4" maxlength="600" placeholder="اكتب تعليمات التنفيذ، ما تم التواصل بشأنه، أو أي متابعة مطلوبة...">'+revEsc(row.taskNotes||'')+'</textarea></label><button class="small-action detail-note-save" data-id="'+revEsc(row.id)+'" type="button">حفظ الملاحظات</button></div>' : (row.taskNotes ? '<div class="revenue-detail-operator-note"><span>الملاحظات التشغيلية</span><p>'+revEsc(row.taskNotes)+'</p></div>' : ''))+
    '<div class="revenue-detail-actions">'+(row.status==='draft'
      ? (task.key==='blocked'
          ? '<button class="small-action detail-task-unblock" data-id="'+revEsc(row.id)+'" type="button">حل العائق</button><button class="small-action detail-task-assign" data-id="'+revEsc(row.id)+'" type="button">تعيين / تحديث SLA</button>'
          : '<button class="small-action detail-task-assign" data-id="'+revEsc(row.id)+'" type="button">تعيين / تحديث SLA</button><button class="small-action detail-task-start" data-id="'+revEsc(row.id)+'" type="button">بدء التنفيذ</button><button class="small-action detail-task-block" data-id="'+revEsc(row.id)+'" type="button">حجب المهمة</button><button class="small-action detail-task-complete" data-id="'+revEsc(row.id)+'" type="button">تسجيل النتيجة</button>')
      : '<span class="status on">تم إغلاق المهمة</span>')+'</div>'+
    '<div class="revenue-detail-history"><h4>سجل النشاط</h4><div class="revenue-detail-activities">'+activityHtml+'</div></div>';
  modal.setAttribute('aria-hidden','false');
  modal.hidden=false;
}
async function openRevenueTaskDetail(id){
  const row=revenueTaskById(id);
  if(!row)return;
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/activity',{cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر تحميل تفاصيل المهمة.');
  renderRevenueTaskDetail(row,data.activityLog||[]);
}
async function revenueTaskAssignFromDetail(id){
  const row=revenueTaskById(id)||{};
  const owner=prompt('اكتب اسم المسؤول أو الدور المسؤول عن المهمة:',row.owner||'');
  if(owner===null)return;
  const hoursInput=prompt('مدة الـSLA بالساعات من الآن:',row.dueAt?String(Math.max(1,Math.round((Date.parse(row.dueAt)-Date.now())/3600000))):'24');
  if(hoursInput===null)return;
  const hours=Math.max(1,Math.min(720,Number(hoursInput)||24));
  const dueAt=new Date(Date.now()+hours*3600000).toISOString();
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,dueAt,workflowStatus:'assigned'})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر تحديث المهمة.');
}
async function revenueTaskBlockFromDetail(id){ await promptRevenueBlocker(id); }
async function revenueTaskUnblockFromDetail(id){
  const row=revenueTaskById(id)||{};
  const nextStatus=row.owner?'assigned':'unassigned';
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:row.owner||'',dueAt:row.dueAt||'',workflowStatus:nextStatus,notes:row.taskNotes||''})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر حل العائق.');
}
async function revenueTaskStartFromDetail(id){
  const row=revenueTaskById(id)||{};
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:row.owner||'',dueAt:row.dueAt||'',workflowStatus:'in_progress'})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر بدء التنفيذ.');
}
async function revenueTaskCompleteFromDetail(id){ await submitRevenueOutcome(id); }
function renderRevenueTaskRouting(){
  const routing=window.revenueTaskRouting||{};
  const set=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
  set('#routing-owner-count',(routing.availableOwners||[]).length);
  set('#routing-unassigned-count',routing.unassignedCount||0);
  set('#routing-suggestion-count',(routing.recommendations||[]).length);
  const note=document.querySelector('#revenue-routing-note');
  if(note)note.textContent=routing.note||'لا توجد اقتراحات توزيع حاليًا.';
  const body=document.querySelector('#revenue-routing-body');
  if(!body)return;
  body.innerHTML=(routing.recommendations||[]).map(row=>{
    const due=row.dueAt?new Date(row.dueAt).toLocaleString('ar-AE',{dateStyle:'short',timeStyle:'short'}):'بدون SLA';
    return '<tr><td><strong>'+revEsc(row.title)+'</strong><small>'+revEsc(row.id)+'</small></td><td class="price">'+revMoney(row.potentialValue)+'</td><td>'+revEsc(row.suggestedOwner)+'</td><td>'+Number(row.suggestedOwnerOpenTasks||0)+' مفتوحة — '+Number(row.suggestedOwnerOverdueTasks||0)+' متأخرة<small>'+revEsc(due)+'</small></td><td><button class="small-action revenue-route-apply" data-route-task="'+revEsc(row.id)+'" data-route-owner="'+revEsc(row.suggestedOwner)+'" data-route-due="'+revEsc(row.dueAt||'')+'" type="button">تطبيق الاقتراح</button></td></tr>';
  }).join('')||'<tr><td colspan="5" class="empty">لا توجد مهام غير مسندة تحتاج اقتراح توزيع حاليًا.</td></tr>';
}

function renderRevenueTaskBoard(){
  const board=revenueTaskBoardData||{};
  const ownerFilter=document.querySelector('#revenue-task-owner-filter');
  const statusFilter=document.querySelector('#revenue-task-status-filter');
  const ownerValue=ownerFilter?.value||'';
  const statusValue=statusFilter?.value||'';
  const groups={blocked:board.blocked||[],overdue:board.overdue||[],inProgress:board.inProgress||[],today:board.today||[],doneToday:board.doneToday||[]};
  const ownerNames=[...new Set(Object.values(groups).flat().map(row=>String(row.owner||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
  if(ownerFilter){
    const current=ownerFilter.value;
    ownerFilter.innerHTML='<option value="">كل المسؤولين</option>'+ownerNames.map(name=>'<option value="'+revEsc(name)+'">'+revEsc(name)+'</option>').join('');
    ownerFilter.value=ownerNames.includes(current)?current:'';
  }
  const renderGroup=(key,rows)=>{
    const filtered=rows.filter(row=>(!ownerValue||String(row.owner||'')===ownerValue)&&(!statusValue||statusValue===key||(statusValue==='overdue'&&row.task?.key==='overdue')||(statusValue==='escalated'&&row.task?.key==='escalated')));
    const node=document.querySelector('#task-board-'+(key==='inProgress'?'inprogress':key==='doneToday'?'done':key));
    if(!node)return;
    node.innerHTML=filtered.map(row=>{
      const task=row.task||{};
      const owner=row.owner||'غير محدد';
      const due=taskBoardTime(row.dueAt);
      const late=task.overdueHours>0?' — تأخير '+Number(task.overdueHours)+'س':'';
      const controls=(row.status==='draft'
        ? (task.key==='blocked'
          ? '<button class="small-action task-board-unblock" data-task-action="unblock" data-id="'+revEsc(row.id)+'">حل العائق</button>'
          : task.key==='unassigned'
            ? '<button class="small-action task-board-assign" data-task-action="assign" data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(row.owner||'')+'">تعيين</button>'
            : '<button class="small-action task-board-start" data-task-action="start" data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(row.owner||'')+'" data-due-at="'+revEsc(row.dueAt||'')+'">بدء التنفيذ</button><button class="small-action task-board-block" data-task-action="block" data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(row.owner||'')+'" data-due-at="'+revEsc(row.dueAt||'')+'" data-blocker-reason="'+revEsc(task.blockerReason||row.blockerReason||'')+'">حجب</button><button class="small-action task-board-complete" data-task-action="complete" data-id="'+revEsc(row.id)+'">تسجيل النتيجة</button>')
        : '<span class="status on">مغلقة</span>')+'<button class="small-action task-board-history" data-task-action="history" data-id="'+revEsc(row.id)+'">سجل النشاط</button>';
      return '<article class="task-card '+revEsc(task.key||key)+'"><div class="task-card-top"><strong>'+revEsc(row.title)+'</strong><span>'+revEsc(task.label||taskBoardLabel[key]||key)+'</span></div><p>'+revEsc(row.message||row.executionNote||'مهمة تشغيلية في مركز الإيرادات.')+'</p><div class="task-risk-line">'+(task.key==='blocked'?'<span class="task-blocker-reason">العائق: '+revEsc(task.blockerReason||row.blockerReason||'غير محدد')+'</span>':'')+'<span class="task-risk-badge '+revEsc(task.riskKey||'low')+'">'+revEsc(task.riskLabel||'مخاطرة منخفضة')+'</span><small>'+revEsc(task.nextAction||'متابعة المهمة.')+'</small></div><small>المسؤول: '+revEsc(owner)+'</small><small>الاستحقاق: '+revEsc(due+late)+'</small><div class="task-card-actions">'+controls+'<button class="small-action task-board-detail" data-task-action="detail" data-id="'+revEsc(row.id)+'">التفاصيل</button></div></article>';
    }).join('')||'<div class="empty task-empty">لا توجد مهام في هذا القسم.</div>';
    const countNode=document.querySelector('#task-board-'+(key==='inProgress'?'inprogress':key==='doneToday'?'done':key)+'-count');
    if(countNode)countNode.textContent=String(filtered.length);
  };
  renderGroup('blocked',groups.blocked);
  renderGroup('overdue',groups.overdue);
  renderGroup('inProgress',groups.inProgress);
  renderGroup('today',groups.today);
  renderGroup('doneToday',groups.doneToday);
  const dateNode=document.querySelector('#revenue-task-board-date');
  if(dateNode)dateNode.textContent=board.date?('اليوم: '+board.date):'اليوم';
}

async function executeAbandonedCartRecovery(reference,button){
  if(!reference)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/abandoned-carts/'+encodeURIComponent(reference)+'/execute',{method:'POST',headers:{'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر تنفيذ استرجاع السلة.');
    const fullUrl=window.location.origin+'/revenue-recovery?token='+encodeURIComponent(data.recoveryToken||'');
    const result=document.querySelector('#revenue-recovery-result');
    const input=document.querySelector('#revenue-recovery-url');
    if(result&&input){input.value=fullUrl;result.hidden=false;result.scrollIntoView({behavior:'smooth',block:'nearest'});}
    try{await navigator.clipboard?.writeText(fullUrl)}catch{}
    alert(data.reused?'رابط استرجاع السلة موجود بالفعل وتم نسخه.':'تم تنفيذ الفرصة وإنشاء رابط استرجاع السلة وتم نسخه.');
  }catch(error){alert(error.message||'تعذر تنفيذ الفرصة.');}
  finally{button.disabled=false;}
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
    set('#rev-abandoned',data.counts?.abandonedCarts);set('#rev-inactive',data.counts?.inactiveCustomers);set('#rev-returning',data.counts?.returnCustomers);set('#rev-product-interest',data.counts?.productInterest);set('#rev-reservations',data.counts?.upcomingReservations);set('#rev-actions-count',data.counts?.topActions);
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
    document.querySelector('#revenue-actions-body').innerHTML=actions.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)}</td><td><strong>${revEsc(row.title)}</strong><small>${revEsc(row.reason)}</small></td><td>${revEsc(row.recommendedAction)}</td><td class="price">${row.potentialValue?revMoney(row.potentialValue):'—'}</td><td>${row.type==='abandoned_cart'?'<button class="small-action" data-recovery-execute data-reference="'+revEsc(row.reference)+'" type="button">استرجاع السلة</button>':row.type==='inactive_customer'?'<button class="small-action" data-inactive-recovery-execute data-reference="'+revEsc(row.reference)+'" type="button">إعادة الطلب</button>':'<span class="status pending">التنفيذ لاحقًا</span>'}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد فرص حالية.</td></tr>';

    const abandoned=data.opportunities?.abandonedCarts||[];
    document.querySelector('#revenue-abandoned-body').innerHTML=abandoned.map(row=>`<tr><td><strong>${revEsc(row.sessionId.slice(0,12))}</strong><small>${new Date(row.lastActivityAt).toLocaleString('ar-AE')}</small></td><td>${revEsc(row.productId||'—')}</td><td>${revPriority(row.priorityKey,row.priority)}</td><td class="price">${revMoney(row.cartValue)}</td><td><button class="small-action" data-recovery-execute data-reference="${revEsc(row.sessionId)}" type="button" ${row.cartItems?.length?'':'disabled'}>${row.cartItems?.length?'استرجاع السلة':'غير متاح'}</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد سلات متروكة مؤهلة حاليًا.</td></tr>';

    const inactive=data.opportunities?.inactiveCustomers||[];
    document.querySelector('#revenue-inactive-body').innerHTML=inactive.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name||'عميل')}</strong><small dir="ltr">${revEsc(row.phone||'')}</small></td><td>${Number(row.orderCount||0)}</td><td>${Number(row.daysSinceLastOrder||0)} يوم</td><td class="price">${row.lastOrderValue?revMoney(row.lastOrderValue):'—'}</td><td><button class="small-action" data-inactive-recovery-execute data-reference="${revEsc(row.id)}" type="button" ${row.cartItems?.length?'':'disabled'}>${row.cartItems?.length?'إعادة الطلب':'غير متاح'}</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا توجد فرص إعادة تنشيط قابلة للتنفيذ حاليًا.</td></tr>';

    const productInterest=data.opportunities?.productInterest||[];
    const productInterestBody=document.querySelector('#revenue-product-interest-body');
    if(productInterestBody)productInterestBody.innerHTML=productInterest.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name||row.productId)}</strong><small>${revEsc(row.productId)}</small></td><td>${Number(row.views||0)}</td><td>${Number(row.adds||0)}</td><td>${Number(row.addRate||0).toFixed(1)}%</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد منتجات عليها فجوة اهتمام مؤهلة حاليًا.</td></tr>';

    const upcoming=data.opportunities?.upcomingReservations||[];
    document.querySelector('#revenue-reservation-body').innerHTML=upcoming.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name)}</strong><small dir="ltr">${revEsc(row.phone)}</small></td><td>${revEsc(row.date)}<small>${revEsc(row.time)}</small></td><td>${Number(row.guests||0)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد حجوزات خلال 48 ساعة.</td></tr>';
    const returning=data.opportunities?.returnCustomers||[];
    const returningBody=document.querySelector('#revenue-returning-body');
    if(returningBody)returningBody.innerHTML=returning.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name||'عميل')}</strong><small dir="ltr">${revEsc(row.phone||'')}</small></td><td>${Number(row.orderCount||0)}</td><td>${Number(row.averageGapDays||0).toFixed(0)} يوم</td><td>${Number(row.daysSinceLastOrder||0)} يوم</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد عملاء حان موعد عودتهم حاليًا.</td></tr>';
    window.revenueTaskRouting=data.taskRouting||{};
    renderRevenueTaskRouting();
    const workload=data.taskWorkload||{};
    const workloadSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    workloadSet('#workload-open',workload.counts?.open);
    workloadSet('#workload-unassigned',workload.counts?.unassigned);
    workloadSet('#workload-overdue',workload.counts?.overdue);
    workloadSet('#workload-owners',workload.counts?.owners);
    const workloadRows=workload.rows||[];
    document.querySelector('#task-workload-owner-body').innerHTML=workloadRows.map(row=>'<tr><td><strong>'+revEsc(row.owner)+'</strong></td><td>'+Number(row.open||0)+'</td><td>'+Number(row.blocked||0)+'</td><td>'+Number(row.inProgress||0)+'</td><td>'+Number(row.dueSoon||0)+'</td><td>'+Number(row.overdue||0)+'</td><td>'+Number(row.escalated||0)+'</td><td class="price">'+revMoney(row.potentialValue)+'</td></tr>').join('')||'<tr><td colspan="8" class="empty">لا توجد مهام مفتوحة حاليًا.</td></tr>';

    const blockerAnalytics=data.blockerAnalytics||{};
    const blockerSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    blockerSet('#blocker-open-count',blockerAnalytics.openCount||0);
    blockerSet('#blocker-resolved-count',blockerAnalytics.resolvedCount||0);
    blockerSet('#blocker-occurrences',blockerAnalytics.totalOccurrences||0);
    blockerSet('#blocker-avg-hours',(blockerAnalytics.averageDurationHours||0).toFixed ? Number(blockerAnalytics.averageDurationHours||0).toFixed(1)+' ساعة' : '0 ساعة');
    blockerSet('#blocker-open-value',revMoney(blockerAnalytics.openPotentialValue||0));
    const blockerBody=document.querySelector('#revenue-blocker-analytics-body');
    if(blockerBody)blockerBody.innerHTML=(blockerAnalytics.rows||[]).map(row=>'<tr><td><strong>'+revEsc(row.label)+'</strong><small>'+revEsc(row.type)+'</small></td><td>'+Number(row.occurrences||0)+'</td><td>'+Number(row.open||0)+'</td><td>'+Number(row.resolved||0)+'</td><td>'+Number(row.averageDurationHours||0).toFixed(1)+'س</td><td class="price">'+revMoney(row.potentialValue||0)+'</td></tr>').join('')||'<tr><td colspan="6" class="empty">لا توجد بيانات حجب مسجلة بعد.</td></tr>';
    const blockerNote=document.querySelector('#revenue-blocker-analytics-note');if(blockerNote)blockerNote.textContent=blockerAnalytics.note||'تحليل العوائق مبني على سجل الحجب.';
    const valueRealization=data.valueRealization||{};
    const valueSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    valueSet('#value-realization-tasks',valueRealization.measurableTasks||0);
    valueSet('#value-realization-converted',valueRealization.convertedTasks||0);
    valueSet('#value-realization-potential',revMoney(valueRealization.potentialValue||0));
    valueSet('#value-realization-captured',revMoney(valueRealization.capturedPotentialValue||0));
    valueSet('#value-realization-gap',revMoney(valueRealization.unrealizedPotentialValue||0));
    valueSet('#value-realization-rate',valueRealization.realizationRate===null||valueRealization.realizationRate===undefined?'—':Number(valueRealization.realizationRate).toFixed(1)+'%');
    const valueNote=document.querySelector('#value-realization-note');if(valueNote)valueNote.textContent=valueRealization.note||'معدل تحقق القيمة مقياس تشغيلي للقيمة المسجلة.';
    const valueBody=document.querySelector('#revenue-value-realization-body');
    if(valueBody)valueBody.innerHTML=(valueRealization.rows||[]).map(row=>'<tr><td><strong>'+revEsc(row.label)+'</strong><small>'+revEsc(row.sourceType)+' / '+revEsc(row.sourceKey)+'</small></td><td>'+Number(row.tasks||0)+'</td><td>'+Number(row.converted||0)+'</td><td class="price">'+revMoney(row.potentialValue||0)+'</td><td class="price">'+revMoney(row.capturedPotentialValue||0)+'</td><td class="price">'+revMoney(row.measuredRevenue||0)+'</td><td class="price">'+revMoney(row.unrealizedPotentialValue||0)+'</td><td>'+((row.realizationRate===null||row.realizationRate===undefined)?'—':Number(row.realizationRate).toFixed(1)+'%')+'</td></tr>').join('')||'<tr><td colspan="8" class="empty">لا توجد مهام مغلقة بقيمة فرصة مسجلة حتى الآن.</td></tr>';
    const riskExposure=data.riskExposure||{};
    const riskSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    riskSet('#risk-high-count',riskExposure.highRiskCount||0);
    riskSet('#risk-high-value',revMoney(riskExposure.highRiskPotentialValue||0));
    riskSet('#risk-total-value',revMoney(riskExposure.totalPotentialValue||0));
    riskSet('#risk-open-count',riskExposure.openTasks||0);
    const riskNote=document.querySelector('#risk-exposure-note');if(riskNote)riskNote.textContent=riskExposure.note||'قيمة الفرص المعرضة للمخاطر لا تعني خسارة مؤكدة.';
    const riskBody=document.querySelector('#risk-exposure-body');
    const riskLabels={high:'عالية',medium:'متوسطة',low:'منخفضة'};
    if(riskBody)riskBody.innerHTML=['high','medium','low'].map(key=>'<tr><td><span class="task-risk-badge '+key+'">'+riskLabels[key]+'</span></td><td>'+Number(riskExposure[key]?.count||0)+'</td><td class="price">'+revMoney(riskExposure[key]?.potentialValue||0)+'</td></tr>').join('');
    
    const briefing=data.dailyBriefing||{};
    const bset=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    bset('#briefing-urgent',briefing.summary?.urgent||0);
    bset('#briefing-due-soon',briefing.summary?.dueSoon||0);
    bset('#briefing-unassigned',briefing.summary?.unassigned||0);
    const briefingDate=document.querySelector('#daily-briefing-date');if(briefingDate)briefingDate.textContent=briefing.date?('اليوم: '+briefing.date):'اليوم';
    const briefingList=document.querySelector('#daily-briefing-list');
    briefingList.innerHTML=(briefing.items||[]).map(item=>'<article class="briefing-item '+revEsc(item.status)+'"><div class="briefing-item-top"><strong>'+revEsc(item.title)+'</strong><span>'+revEsc(item.statusLabel||item.status||'—')+'</span></div><p>'+revEsc(item.reason)+'</p><small>المسؤول: '+revEsc(item.owner||'غير محدد')+' — '+revEsc(item.dueAt?new Date(item.dueAt).toLocaleString('ar-AE',{dateStyle:'short',timeStyle:'short'}):'بدون SLA')+'</small><small>الإجراء: '+revEsc(item.recommendedAction)+'</small></article>').join('')||'<div class="empty">لا توجد نقاط عاجلة في موجز اليوم.</div>';

    const campaigns=data.campaigns||{};
    revenueCampaignsData=campaigns.recent||[];
    const outcomeLearning=campaigns.outcomeLearning||{};
    const learningSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    learningSet('#learning-sources',outcomeLearning.sourcesMeasured||0);
    learningSet('#learning-outcomes',outcomeLearning.outcomesMeasured||0);
    learningSet('#learning-converted',outcomeLearning.converted||0);
    learningSet('#learning-revenue',revMoney(outcomeLearning.measuredRevenue||0));
    const learningNote=document.querySelector('#outcome-learning-note');if(learningNote)learningNote.textContent=outcomeLearning.note||'التعلم مبني على النتائج المسجلة يدويًا.';
    const learningBody=document.querySelector('#outcome-learning-body');
    if(learningBody){
      learningBody.innerHTML=(outcomeLearning.rows||[]).map(row=>'<tr><td><strong>'+revEsc(row.label)+'</strong><small>'+revEsc(row.sourceType)+' / '+revEsc(row.sourceKey)+'</small></td><td><span class="learning-signal '+revEsc(row.signalKey||'early')+'">'+revEsc(row.signalLabel||'إشارة مبكرة')+'</span><small>'+revEsc(row.signalNote||'')+'</small></td><td>'+Number(row.total||0)+'</td><td>'+Number(row.converted||0)+'</td><td>'+Number(row.conversionRate||0).toFixed(1)+'%</td><td>'+revMoney(row.measuredRevenue||0)+'</td><td><strong>'+revEsc(row.topReason||'غير مصنف')+'</strong><small>'+revEsc(row.learningAction||'استمر في القياس.')+'</small></td></tr>').join('')||'<tr><td colspan="7" class="empty">لا توجد نتائج كافية لاستخراج تعلّم من المصادر بعد.</td></tr>';
    }
    const outcomeInsights=campaigns.outcomeInsights||{};
    const outcomeSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??0)};
    outcomeSet('#outcome-total',outcomeInsights.totalRecorded||0);
    outcomeSet('#outcome-converted',outcomeInsights.converted||0);
    outcomeSet('#outcome-executed',outcomeInsights.executed||0);
    outcomeSet('#outcome-ignored',outcomeInsights.ignored||0);
    outcomeSet('#outcome-top-reason',outcomeInsights.topReason?.label||'—');
    const outcomeNote=document.querySelector('#outcome-reasons-note');if(outcomeNote)outcomeNote.textContent=outcomeInsights.note||'أسباب النتائج تُسجّل يدويًا لأغراض التشخيص.';
    const outcomeBody=document.querySelector('#outcome-reasons-body');
    if(outcomeBody)outcomeBody.innerHTML=(outcomeInsights.byReason||[]).map(row=>'<tr><td><strong>'+revEsc(row.label)+'</strong><small>'+revEsc(row.key)+'</small></td><td>'+Number(row.count||0)+'</td><td>'+Number(row.converted||0)+'</td><td>'+Number(row.executed||0)+'</td><td>'+Number(row.ignored||0)+'</td><td class="price">'+revMoney(row.measuredRevenue)+'</td></tr>').join('')||'<tr><td colspan="6" class="empty">لا توجد نتائج مسجلة بعد.</td></tr>';
    const taskPerformance=data.taskPerformance||{};
    const perfSet=(id,value)=>{const node=document.querySelector(id);if(node)node.textContent=String(value??'—')};
    perfSet('#task-perf-sla-rate',taskPerformance.onTimeRate===null||taskPerformance.onTimeRate===undefined?'—':Number(taskPerformance.onTimeRate).toFixed(1)+'%');
    perfSet('#task-perf-avg-hours',taskPerformance.averageCompletionHours===null||taskPerformance.averageCompletionHours===undefined?'—':Number(taskPerformance.averageCompletionHours).toFixed(1)+' ساعة');
    perfSet('#task-perf-completed',taskPerformance.completed||0);
    perfSet('#task-perf-overdue',taskPerformance.overdueCompleted||0);
    const ownerRows=taskPerformance.byOwner||[];
    document.querySelector('#task-performance-owner-body').innerHTML=ownerRows.map(row=>'<tr><td><strong>'+revEsc(row.owner)+'</strong></td><td>'+Number(row.completed||0)+'</td><td>'+Number(row.slaMeasured||0)+'</td><td>'+Number(row.onTime||0)+'</td><td>'+Number(row.overdueCompleted||0)+'</td><td>'+((row.onTimeRate===null||row.onTimeRate===undefined)?'—':Number(row.onTimeRate).toFixed(1)+'%')+'</td><td>'+((row.averageCompletionHours===null||row.averageCompletionHours===undefined)?'—':Number(row.averageCompletionHours).toFixed(1)+'س')+'</td></tr>').join('')||'<tr><td colspan="7" class="empty">لا توجد بيانات كافية لقياس أداء المسؤولين بعد.</td></tr>';
    revenueTaskBoardData=campaigns.taskBoard||{};
    renderRevenueTaskBoard();
    setMetric('#rev-drafts',campaigns.counts?.drafts);setMetric('#rev-executed',campaigns.counts?.executed);setMetric('#rev-converted',campaigns.counts?.converted);setMetric('#rev-attributed-orders',campaigns.counts?.attributedOrders);
    setMetric('#rev-open-tasks',campaigns.counts?.openTasks);setMetric('#rev-in-progress-tasks',campaigns.counts?.inProgressTasks);setMetric('#rev-overdue-tasks',campaigns.counts?.overdueTasks);setMetric('#rev-escalated-tasks',campaigns.counts?.escalatedTasks);setMetric('#rev-blocked-tasks',campaigns.counts?.blockedTasks);
    const measured=document.querySelector('#rev-measured-revenue');if(measured)measured.textContent=revMoney(campaigns.counts?.measuredRevenue);
    const taskLabels={unassigned:'غير مسندة',assigned:'مسندة',in_progress:'قيد التنفيذ',blocked:'محجوبة',overdue:'متأخرة',escalated:'تصعيد مطلوب',done:'مكتملة'};
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
      const actionButtons=row.status==='draft'
        ? (taskKey==='blocked'
          ? '<button class="small-action" data-campaign-detail data-id="'+revEsc(row.id)+'" type="button">التفاصيل</button>'
          : '<button class="small-action" data-campaign-task data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(task.owner||row.owner||'')+'" data-due-at="'+revEsc(dueAt)+'" type="button">'+(taskKey==='unassigned'?'تعيين + SLA':'تعديل المهمة')+'</button>'+(taskKey==='assigned' ? '<button class="small-action" data-campaign-start data-id="'+revEsc(row.id)+'" data-owner="'+revEsc(owner==='غير محدد'?'':owner)+'" data-due-at="'+revEsc(dueAt)+'" type="button">بدء التنفيذ</button>' : '')+(taskKey==='assigned'||taskKey==='in_progress'||taskKey==='overdue'||taskKey==='escalated' ? '<button class="small-action" data-campaign-block data-id="'+revEsc(row.id)+'" type="button">حجب</button>' : ''))
        : '';
      const outcomeButtons=row.status==='draft'
        ? (taskKey==='blocked'
          ? '<span class="status pending">محجوبة — حل العائق أولًا</span><button class="small-action" data-campaign-detail data-id="'+revEsc(row.id)+'" type="button">التفاصيل</button>'
          : '<button class="small-action" data-campaign-outcome="executed" data-id="'+revEsc(row.id)+'" type="button">تم التنفيذ</button><button class="small-action" data-campaign-outcome="converted" data-id="'+revEsc(row.id)+'" type="button">سجل التحول</button><button class="small-action" data-campaign-detail data-id="'+revEsc(row.id)+'" type="button">التفاصيل</button>')
        : '<span class="status on">تم تسجيل النتيجة</span><button class="small-action" data-campaign-detail data-id="'+revEsc(row.id)+'" type="button">التفاصيل</button>';
      return '<tr><td><strong>'+revEsc(row.id)+'</strong><small>'+revEsc(row.title)+'</small></td><td>'+revEsc({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت',ignored:'تم التجاهل'}[row.status]||row.status)+'</td><td><div class="task-meta"><span class="rev-task '+revEsc(taskClass)+'">'+revEsc(taskLabel)+'</span><strong>'+revEsc(owner)+'</strong><small>'+revEsc(dueText)+'</small></div></td><td class="price">'+(row.resultRevenue?revMoney(row.resultRevenue):'—')+'</td><td class="campaign-actions">'+(actionButtons||'—')+'</td><td>'+outcomeButtons+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="empty">لا توجد مسودات حتى الآن.</td></tr>';
    if(state)state.textContent=`آخر تحديث: ${new Date(data.generatedAt).toLocaleString('ar-AE')} — نافذة التحليل ${data.windowDays} يوم`;
  }catch(error){ if(state)state.textContent=error.message; }
}

document.querySelector('#revenue-routing-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-route-task]'); if(!button)return;
  const id=button.dataset.routeTask;
  const owner=button.dataset.routeOwner||'';
  button.disabled=true;
  try{
    const currentRouting=window.revenueTaskRouting?.recommendations||[];
    const row=currentRouting.find(item=>item.id===id);
    if(!owner)throw new Error('لا يوجد مسؤول مقترح لهذه المهمة.');
    const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,dueAt:row?.dueAt||button.dataset.routeDue||'',workflowStatus:'assigned'})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر تطبيق اقتراح التوزيع.');
    button.textContent='تم التعيين';
    await loadRevenue();
  }catch(error){alert(error.message);button.disabled=false;}
});

async function revenueTaskSaveNotesFromDetail(id){
  const row=revenueTaskById(id)||{};
  const note=document.querySelector('#revenue-detail-task-note');
  const notes=note?note.value.trim():'';
  const workflowStatus=['unassigned','assigned','in_progress','blocked'].includes(row.workflowStatus)?row.workflowStatus:(row.owner?'assigned':'unassigned');
  const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:row.owner||'',dueAt:row.dueAt||'',workflowStatus,notes,blockerReason:row.blockerReason||row.task?.blockerReason||''})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'تعذر حفظ الملاحظات.');
}

document.querySelector('#revenue-task-detail-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-id][class*="detail-task-"]'); if(!button)return;
  const id=button.dataset.id; button.disabled=true;
  try{
    if(button.classList.contains('detail-note-save')){
      await revenueTaskSaveNotesFromDetail(id);
      await loadRevenue();
      await openRevenueTaskDetail(id);
      return;
    }
    if(button.classList.contains('detail-task-assign')) await revenueTaskAssignFromDetail(id);
    else if(button.classList.contains('detail-task-start')) await revenueTaskStartFromDetail(id);
    else if(button.classList.contains('detail-task-block')) await revenueTaskBlockFromDetail(id);
    else if(button.classList.contains('detail-task-unblock')) await revenueTaskUnblockFromDetail(id);
    else if(button.classList.contains('detail-task-complete')) await revenueTaskCompleteFromDetail(id);
    await loadRevenue();
    await openRevenueTaskDetail(id);
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});
document.querySelector('#revenue-task-detail-close')?.addEventListener('click',()=>{
  const modal=document.querySelector('#revenue-task-detail-modal'); if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true');}
});

document.querySelector('#revenue-task-board')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-task-action]'); if(!button)return;
  const action=button.dataset.taskAction;
  const id=button.dataset.id;
  button.disabled=true;
  try{
    if(action==='detail'){
      await openRevenueTaskDetail(id);
      return;
    }
    if(action==='unblock'){
      const row=revenueTaskById(id)||{};
      const nextStatus=row.owner?'assigned':'unassigned';
      const response=await fetch(revenueApiBase()+'/api/revenue/campaigns/'+encodeURIComponent(id)+'/task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:row.owner||'',dueAt:row.dueAt||'',workflowStatus:nextStatus,notes:row.taskNotes||''})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر حل العائق.');
      await loadRevenue();
      return;
    }
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
    }else if(action==='block'){
      await promptRevenueBlocker(id);
    }else if(action==='complete'){
      await submitRevenueOutcome(id);
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

async function executeInactiveCustomerRecovery(reference,button){
  if(!reference)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/inactive-customers/'+encodeURIComponent(reference)+'/execute',{method:'POST',headers:{'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر تنفيذ إعادة تنشيط العميل.');
    const fullUrl=window.location.origin+'/revenue-recovery?token='+encodeURIComponent(data.recoveryToken||'');
    const result=document.querySelector('#revenue-recovery-result');
    const input=document.querySelector('#revenue-recovery-url');
    if(result&&input){input.value=fullUrl;result.hidden=false;result.scrollIntoView({behavior:'smooth',block:'nearest'});}
    try{await navigator.clipboard?.writeText(fullUrl)}catch{}
    alert(data.reused?'رابط إعادة الطلب موجود بالفعل وتم نسخه.':'تم تنفيذ الفرصة وإنشاء رابط إعادة الطلب وتم نسخه.');
  }catch(error){alert(error.message||'تعذر تنفيذ إعادة تنشيط العميل.');}
  finally{button.disabled=false;}
}
document.querySelector('#revenue')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-recovery-execute]');
  if(button&&!button.disabled){void executeAbandonedCartRecovery(button.dataset.reference,button);return;}
  const inactiveButton=event.target.closest('[data-inactive-recovery-execute]');
  if(inactiveButton&&!inactiveButton.disabled){void executeInactiveCustomerRecovery(inactiveButton.dataset.reference,inactiveButton);}
});
document.querySelector('#revenue-recovery-copy')?.addEventListener('click',async()=>{
  const input=document.querySelector('#revenue-recovery-url');
  if(!input?.value)return;
  try{await navigator.clipboard.writeText(input.value);alert('تم نسخ رابط استرجاع السلة.');}
  catch{input.focus();input.select();alert('تم تحديد الرابط. انسخه يدويًا.');}
});
document.querySelector('#revenue-recovery-open')?.addEventListener('click',()=>{
  const input=document.querySelector('#revenue-recovery-url');
  if(input?.value)window.open(input.value,'_blank','noopener');
});
document.querySelector('#revenue-actions-body')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-create-draft]'); if(!button)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/campaign-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:button.dataset.type,reference:button.dataset.reference})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||'تعذر إنشاء المسودة.');
    alert(data.reused ? 'المهمة موجودة بالفعل ومفتوحة لنفس الفرصة؛ لم يتم إنشاء نسخة مكررة.' : 'تم إنشاء المسودة. لا يوجد إرسال تلقائي في هذه النسخة.');
    await loadRevenue();
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});
document.querySelector('#revenue-campaigns-body')?.addEventListener('click',async event=>{
  const detailButton=event.target.closest('[data-campaign-detail]');
  if(detailButton){
    detailButton.disabled=true;
    try{ await openRevenueTaskDetail(detailButton.dataset.id); }
    catch(error){ alert(error.message); }
    finally{ detailButton.disabled=false; }
    return;
  }

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
  const blockButton=event.target.closest('[data-campaign-block]');
  if(blockButton){
    blockButton.disabled=true;
    try{
      if(await promptRevenueBlocker(blockButton.dataset.id))await loadRevenue();
    }catch(error){alert(error.message)}finally{blockButton.disabled=false;}
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
  button.disabled=true;
  try{
    const saved=await submitRevenueOutcome(button.dataset.id,button.dataset.campaignOutcome);
    if(saved)await loadRevenue();
  }catch(error){alert(error.message)}finally{button.disabled=false;}
});

document.querySelector('#revenue-alerts-list')?.addEventListener('click',async event=>{
  const button=event.target.closest('[data-alert-action]'); if(!button)return;
  button.disabled=true;
  try{
    const response=await fetch(revenueApiBase()+'/api/revenue/campaign-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'alert_action',reference:button.dataset.alertAction})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر إنشاء المهمة.');
    button.textContent=data.reused?'المهمة موجودة بالفعل':'تم إنشاء المهمة';
    await loadRevenue();
  }catch(error){alert(error.message);button.disabled=false;}
});
