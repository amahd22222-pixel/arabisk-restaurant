const linkEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const getCampaigns=()=>Array.isArray(window.__ARABISK_REVENUE_CAMPAIGNS__)?window.__ARABISK_REVENUE_CAMPAIGNS__:[];
const campaignOrderId=row=>String(row?.attribution?.orderId||row?.orderId||'').trim();
const campaignStatus=row=>({draft:'مسودة',executed:'تم التنفيذ',converted:'تحولت إلى طلب',ignored:'تم التجاهل'})[row?.status]||row?.status||'إجراء';

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
    const signature=linked.map(row=>String(row.id||'')).join('|');
    if(host?.dataset.signature===signature)return;
    host?.remove();
    host=document.createElement('div');
    host.className='order-revenue-links';
    host.dataset.signature=signature;
    host.innerHTML='<span>مرتبط بالإيرادات</span>'+
      linked.slice(0,3).map(row=>'<button type="button" class="small-action order-revenue-link" data-order-revenue-action="'+linkEsc(row.id||'')+'">فتح '+linkEsc(campaignStatus(row))+'</button>').join('')+
      (linked.length>3?'<small>+'+(linked.length-3)+' إجراءات أخرى</small>':'');
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
window.addEventListener('arabisk:revenue-state-updated',renderOrderRevenueLinks);
renderOrderRevenueLinks();
const orderBody=document.querySelector('#orders-body');
if(orderBody){
  const observer=new MutationObserver(renderOrderRevenueLinks);
  observer.observe(orderBody,{childList:true,subtree:true});
}