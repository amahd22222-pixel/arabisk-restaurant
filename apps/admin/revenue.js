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

    const actions=data.topActions||[];
    document.querySelector('#revenue-actions-body').innerHTML=actions.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)}</td><td><strong>${revEsc(row.title)}</strong><small>${revEsc(row.reason)}</small></td><td>${revEsc(row.recommendedAction)}</td><td class="price">${row.potentialValue?revMoney(row.potentialValue):'—'}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد إجراءات مقترحة حاليًا.</td></tr>';

    const abandoned=data.opportunities?.abandonedCarts||[];
    document.querySelector('#revenue-abandoned-body').innerHTML=abandoned.map(row=>`<tr><td><strong>${revEsc(row.sessionId.slice(0,12))}</strong><small>${new Date(row.lastActivityAt).toLocaleString('ar-AE')}</small></td><td>${revEsc(row.productId||'—')}</td><td>${revPriority(row.priorityKey,row.priority)}</td><td class="price">${revMoney(row.cartValue)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد سلات متروكة مؤهلة حاليًا.</td></tr>';

    const inactive=data.opportunities?.inactiveCustomers||[];
    document.querySelector('#revenue-inactive-body').innerHTML=inactive.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name||'عميل')}</strong><small dir="ltr">${revEsc(row.phone||'')}</small></td><td>${Number(row.orderCount||0)}</td><td>${Number(row.daysSinceLastOrder||0)} يوم</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد فرص إعادة تنشيط حاليًا.</td></tr>';

    const upcoming=data.opportunities?.upcomingReservations||[];
    document.querySelector('#revenue-reservation-body').innerHTML=upcoming.map(row=>`<tr><td>${revPriority(row.priorityKey,row.priority)} <strong>${revEsc(row.name)}</strong><small dir="ltr">${revEsc(row.phone)}</small></td><td>${revEsc(row.date)}<small>${revEsc(row.time)}</small></td><td>${Number(row.guests||0)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">لا توجد حجوزات خلال 48 ساعة.</td></tr>';
    if(state)state.textContent=`آخر تحديث: ${new Date(data.generatedAt).toLocaleString('ar-AE')} — نافذة التحليل ${data.windowDays} يوم`;
  }catch(error){ if(state)state.textContent=error.message; }
}
document.querySelector('#revenue-refresh')?.addEventListener('click',()=>void loadRevenue());
document.querySelector('[data-section="revenue"]')?.addEventListener('click',()=>void loadRevenue());
void loadRevenue();
