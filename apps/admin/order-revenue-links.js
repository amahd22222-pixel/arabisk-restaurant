const linkEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const getCampaigns=()=>Array.isArray(window.__ARABISK_REVENUE_CAMPAIGNS__)?window.__ARABISK_REVENUE_CAMPAIGNS__:[];
const campaignOrderId=row=>String(row?.attribution?.orderId||row?.orderId||'').trim();
const campaignStatus=row=>({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت إلى طلب',ignored:'تم التجاهل'})[row?.status]||row?.status||'إجراء';
const outcomeReasonLabel=row=>({converted_to_order:'تحول إلى طلب فعلي',manual_conversion:'تحول مسجل يدويًا',completed_no_conversion:'تم التنفيذ بدون تحول',customer_unresponsive:'لم يرد العميل',not_interested:'غير مهتم',not_relevant:'العرض غير مناسب',operational_issue:'عائق تشغيلي',timing:'التوقيت غير مناسب',duplicate:'مكرر / تمت معالجته سابقًا',other:'سبب آخر',unclassified:'غير مصنف'})[row?.outcomeReason]||'';
const campaignRevenue=row=>Number(row?.resultRevenue||row?.revenue||0);

async function openOrderRevenueAction(campaignId){
  const id=String(campaignId||'').trim();
  if(!id)return;
  document.querySelector('[data-section="revenue"]')?.click();
  if(window.ARABISK_LOAD_REVENUE)await window.ARABISK_LOAD_REVENUE();
  const target=document.querySelector('[data-campaign-id="'+CSS.escape(id)+'"]');
  if(target){
    target.classList.add('customer360-highlight-row');
    target.scrollIntoView({behavior:'smooth',block:'center'});
    const detail=target.querySelector('[data-campaign-detail]');
    if(detail)setTimeout(()=>detail.click(),180);
    setTimeout(()=>target.classList.remove('customer360-highlight-row'),2400);
    return;
  }
  alert('لم يتم العثور على الإجراء المرتبط ضمن الإجراءات المحمّلة حاليًا.');
}

function renderOrderRevenueLinks(){
  const body=document.querySelector('#orders-body');
  if(!body)return;
  const campaigns=getCampaigns();
  const byOrder=new Map();
  campaigns.forEach(row=>{
    const orderId=campaignOrderId(row);
    if(!orderId)return;
    if(!byOrder.has(orderId))byOrder.set(orderId,[]);
    byOrder.get(orderId).push(row);
  });
  body.querySelectorAll('tr').forEach(tr=>{
    const select=tr.querySelector('select[data-order-status]');
    const actionsCell=select?.closest('td');
    if(!select||!actionsCell)return;
    const orderId=select.getAttribute('data-order-status')||'';
    const linked=byOrder.get(orderId)||[];
    let host=actionsCell.querySelector('.order-revenue-links');
    if(!linked.length){
      host?.remove();
      return;
    }
    const signature=linked.map(row=>[row.id,row.status,campaignRevenue(row),row.outcomeReason,row.outcomeReasonNote].join(':')).join('|');
    if(host?.dataset.signature===signature)return;
    host?.remove();
    host=document.createElement('div');
    host.className='order-revenue-links';
    host.dataset.signature=signature;
    const measuredRevenue=linked.reduce((sum,row)=>sum+campaignRevenue(row),0);
    const convertedCount=linked.filter(row=>row.status==='converted').length;
    const summary=measuredRevenue>0?'إيراد مقاس: AED '+measuredRevenue.toFixed(0):'لا يوجد إيراد مقاس';
    host.innerHTML='<span class="order-revenue-heading">مرتبط بالإيرادات — '+linked.length+' إجراء</span>'+
      '<div class="order-revenue-summary"><b>'+linkEsc(summary)+'</b><small>'+convertedCount+' تحول مسجل</small></div>'+
      '<div class="order-revenue-actions">'+
      linked.slice(0,3).map(row=>{
        const reason=outcomeReasonLabel(row);
        const note=String(row.outcomeReasonNote||'').trim();
        return '<div class="order-revenue-item"><div class="order-revenue-item-main"><strong>'+linkEsc(row.title||'إجراء إيرادات')+'</strong><span>'+linkEsc(campaignStatus(row))+(campaignRevenue(row)>0?' — AED '+campaignRevenue(row).toFixed(0):'')+'</span>'+(reason?'<small>'+linkEsc(reason)+(note?' — '+linkEsc(note):'')+'</small>':'')+'</div><button type="button" class="small-action order-revenue-link" data-order-revenue-action="'+linkEsc(row.id||'')+'">فتح</button></div>';
      }).join('')+
      '</div>'+
      (linked.length>3?'<small>+'+(linked.length-3)+' إجراءات أخرى مرتبطة بنفس الطلب</small>':'');
    actionsCell.appendChild(host);
  });
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-order-revenue-action]');
  if(!button)return;
  button.disabled=true;
  void openOrderRevenueAction(button.dataset.orderRevenueAction)
    .catch(error=>alert(error.message||'تعذر فتح الإجراء المرتبط.'))
    .finally(()=>{button.disabled=false;});
});
let orderRevenueRenderFrame=0;
let orderRevenueRenderPending=false;
function scheduleOrderRevenueRender(){
  if(orderRevenueRenderPending)return;
  orderRevenueRenderPending=true;
  const run=()=>{
    orderRevenueRenderPending=false;
    orderRevenueRenderFrame=0;
    renderOrderRevenueLinks();
  };
  orderRevenueRenderFrame=requestAnimationFrame(run);
}
window.addEventListener('arabisk:revenue-state-updated',scheduleOrderRevenueRender);
scheduleOrderRevenueRender();
const orderBody=document.querySelector('#orders-body');
if(orderBody){
  const observer=new MutationObserver(mutations=>{
    if(mutations.every(mutation=>{
      const target=mutation.target instanceof Element?mutation.target:null;
      const nodes=[...mutation.addedNodes,...mutation.removedNodes];
      return !!target?.closest('.order-revenue-links') || nodes.every(node=>node instanceof Element && node.closest('.order-revenue-links'));
    }))return;
    scheduleOrderRevenueRender();
  });
  observer.observe(orderBody,{childList:true,subtree:true});
  window.__ARABISK_ORDER_REVENUE_RENDER_FRAME__=()=>orderRevenueRenderFrame;
  window.__ARABISK_ORDER_REVENUE_OBSERVER__=observer;
}