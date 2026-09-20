(() => {
'use strict';

const CHECKOUT_KEY='arabisk-checkout-v3';
const LAST_ORDER_KEY='arabisk-last-order-v1';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const readCart=()=>window.ARABISK_CART?.getItems?.()||[];
async function hydrateCartView(){
  const currentItems=readCart();
  const incomplete=currentItems.filter(item=>!item.hydrated&&(!item.nameAr||item.nameAr===item.id||Number(item.price)<=0));
  if(!incomplete.length)return currentItems;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch('/api/products',{cache:'no-store',signal:controller.signal});
      const products=await response.json().catch(()=>[]);
      if(!response.ok||!Array.isArray(products))return currentItems;
      const hydrated=currentItems.map(item=>{
        const product=products.find(row=>String(row.id)===String(item.id));
        return product?{...product,qty:item.qty}:item;
      });
      window.ARABISK_CART?.setItems?.(hydrated);
      return readCart();
    }finally{clearTimeout(timer)}
  }catch{return currentItems}
}
const readCheckout=()=>{const value=readJson(CHECKOUT_KEY,{});return value&&typeof value==='object'?value:{}};
const saveCheckout=value=>writeJson(CHECKOUT_KEY,{orderType:['dine_in','pickup'].includes(value?.orderType)?value.orderType:'dine_in',tableNumber:String(value?.tableNumber||'').trim().slice(0,30),name:String(value?.name||'').trim().slice(0,80),phone:String(value?.phone||'').trim().slice(0,40)});
const saveLastOrder=(data,{orderType='dine_in',tableNumber='',name='',phone='' }={})=>{if(!data?.id)return;writeJson(LAST_ORDER_KEY,{id:String(data.id),orderType:orderType==='pickup'?'pickup':'dine_in',tableNumber:String(tableNumber||'').trim().slice(0,30),name:String(name||'').trim().slice(0,80),phone:String(phone||'').trim().slice(0,40),total:Number(data.total||0),status:String(data.status||'pending'),updatedAt:data.updatedAt||new Date().toISOString()})};
const readLastOrder=()=>{const value=readJson(LAST_ORDER_KEY,null);return value&&value.id?value:null};
const statusMeta={pending:{label:'تم استلام الطلب',step:1},confirmed:{label:'تم تأكيد الطلب',step:2},preparing:{label:'جاري التحضير',step:3},ready:{label:'الطلب جاهز',step:4},completed:{label:'تم إكمال الطلب',step:5},cancelled:{label:'تم إلغاء الطلب',step:0}};
let cart=readCart();
let trackingTimer=null;
const total=()=>cart.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
const count=()=>cart.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
const money=value=>'AED '+Number(value||0).toFixed(0);

function syncCheckoutFields(){const saved=readCheckout();const type=document.querySelector('#cart-order-type');const table=document.querySelector('#cart-table');const name=document.querySelector('#cart-name');const phone=document.querySelector('#cart-phone');if(type)type.value=saved.orderType||'dine_in';if(table)table.value=saved.tableNumber||'';if(name)name.value=saved.name||'';if(phone)phone.value=saved.phone||'';syncOrderTypeUI();}
function persistCheckout(){saveCheckout({orderType:document.querySelector('#cart-order-type')?.value,tableNumber:document.querySelector('#cart-table')?.value,name:document.querySelector('#cart-name')?.value,phone:document.querySelector('#cart-phone')?.value});}
function syncOrderTypeUI(){
  const type=document.querySelector('#cart-order-type');const dineIn=type?.value!=='pickup';
  const tableWrap=document.querySelector('#cart-table-wrap');const table=document.querySelector('#cart-table');
  const pickup=document.querySelector('#cart-pickup-fields');const name=document.querySelector('#cart-name');const phone=document.querySelector('#cart-phone');
  const note=document.querySelector('#cart-context-note');
  if(tableWrap){if(dineIn){tableWrap.removeAttribute('hidden');}else{tableWrap.setAttribute('hidden','');}}
  if(table) table.required=dineIn;
  if(pickup){if(dineIn){pickup.setAttribute('hidden','');}else{pickup.removeAttribute('hidden');pickup.style.display='grid';}}
  if(name) name.required=!dineIn;
  if(phone) phone.required=!dineIn;
  if(note) note.textContent=dineIn?'لطلب داخل المطعم أدخل رقم الطاولة. لا نحتاج إلى اسم أو رقم هاتف.':'لاستلام طلبك من المطعم أدخل الاسم ورقم الهاتف، ولا تحتاج إلى رقم طاولة.';
}

function syncTrackingTypeUI(){
  const type=document.querySelector('#track-type');const dineIn=type?.value!=='pickup';
  const tableWrap=document.querySelector('#track-table-wrap');const phoneWrap=document.querySelector('#track-phone-wrap');
  const table=document.querySelector('#track-table');const phone=document.querySelector('#track-phone');
  if(tableWrap)tableWrap.hidden=!dineIn;
  if(phoneWrap)phoneWrap.hidden=dineIn;
  if(table)table.required=dineIn;
  if(phone)phone.required=!dineIn;
}
function emptyMarkup(){return '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><h2>السلة فارغة</h2><p>لم تضف أي صنف بعد. تصفّح المنيو واختر أطباقك، ثم ارجع هنا لإكمال الطلب.</p><a class="cart-primary" href="/menu">استكشف المنيو</a></div>';}
function render(){const items=document.querySelector('#cart-items');const countLabel=document.querySelector('#cart-count-label');const summaryCount=document.querySelector('#cart-summary-count');const summaryTotal=document.querySelector('#cart-summary-total');const formWrap=document.querySelector('#cart-form-wrap');const emptySummary=document.querySelector('#cart-empty-summary');const clearButton=document.querySelector('#cart-clear');const trackLast=document.querySelector('#cart-track-last');const last=readLastOrder();const itemCount=count();if(countLabel)countLabel.textContent=itemCount?itemCount+' '+(itemCount===1?'صنف':'أصناف'):'لا توجد أصناف';if(summaryCount)summaryCount.textContent=String(itemCount);if(summaryTotal)summaryTotal.textContent=money(total());if(formWrap)formWrap.hidden=!cart.length;if(emptySummary)emptySummary.hidden=Boolean(cart.length);if(clearButton)clearButton.hidden=!cart.length;if(trackLast){trackLast.hidden=!last;trackLast.textContent=last?'متابعة '+last.id:'متابعة آخر طلب';}if(!items)return;if(!cart.length){items.innerHTML=emptyMarkup();return;}items.innerHTML=cart.map(item=>'<article class="cart-item"><img class="cart-item-image" src="'+esc(item.imageUrl||'')+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><div class="cart-item-copy"><h3 class="cart-item-name">'+esc(item.nameAr)+'</h3><p class="cart-item-price">'+money(item.price)+' للصنف</p><div class="cart-item-total">'+money(Number(item.price)*Number(item.qty))+'</div></div><div class="cart-item-actions"><div class="cart-qty"><button type="button" data-inc="'+esc(item.id)+'" aria-label="زيادة الكمية">+</button><span>'+Number(item.qty)+'</span><button type="button" data-dec="'+esc(item.id)+'" aria-label="إنقاص الكمية">−</button></div><button class="cart-remove" type="button" data-remove="'+esc(item.id)+'">حذف الصنف</button></div></article>').join('');}
function setQty(id,next){if(!window.ARABISK_CART?.setQuantity?.(id,next))return;cart=readCart();render();}
function showSuccess(data){document.querySelector('#success-order-id').textContent=data?.id||'—';document.querySelector('#success-order-total').textContent=money(data?.total);document.querySelector('#cart-success').classList.add('show');}
function closeModal(id){document.querySelector(id)?.classList.remove('show');}
function renderTracking(data){const meta=statusMeta[data?.status]||{label:'حالة الطلب غير معروفة',step:0};document.querySelector('#track-title').textContent='طلب '+(data?.id||'—');document.querySelector('#track-status').innerHTML='<strong>'+esc(meta.label)+'</strong><span>'+(data?.status==='cancelled'?'تعذر إكمال الطلب.':'يتم تحديث الحالة أثناء تجهيز طلبك.')+'</span>';document.querySelector('#track-updated').textContent=data?.updatedAt?'آخر تحديث: '+new Date(data.updatedAt).toLocaleString('ar-AE',{dateStyle:'medium',timeStyle:'short'}):'';const steps=[['pending','استلام الطلب'],['confirmed','تأكيد الطلب'],['preparing','التحضير'],['ready','جاهز للاستلام'],['completed','مكتمل']];document.querySelector('#track-timeline').innerHTML=steps.map(function(pair,index){const key=pair[0],label=pair[1];const done=data?.status!=='cancelled'&&meta.step>=index+1;const active=data?.status===key;return '<div class="cart-step '+(done?'done ':'')+(active?'active':'')+'"><span class="cart-step-badge">'+(done?'✓':index+1)+'</span><div><strong>'+label+'</strong><small>'+(active?'الحالة الحالية':done?'تم':'بانتظار التحديث')+'</small></div></div>';}).join('')+(data?.status==='cancelled'?'<div class="cart-step active"><span class="cart-step-badge">!</span><div><strong>تم إلغاء الطلب</strong><small>يرجى التواصل مع المطعم.</small></div></div>':'');document.querySelector('#track-items').innerHTML=Array.isArray(data?.items)?data.items.map(item=>'<div class="cart-track-item"><span>'+esc(item.nameAr||item.nameEn||'صنف')+' × '+Number(item.quantity||0)+'</span><small>'+money(item.lineTotal??((Number(item.unitPrice)||0)*(Number(item.quantity)||0)))+'</small></div>').join(''):'';document.querySelector('#track-total').textContent='الإجمالي '+money(data?.total);}
async function fetchTracking(showError){
  const orderId=String(document.querySelector('#track-id')?.value||'').trim().toUpperCase();
  const type=document.querySelector('#track-type')?.value||'dine_in';
  const tableNumber=String(document.querySelector('#track-table')?.value||'').trim();
  const phone=String(document.querySelector('#track-phone')?.value||'').trim();
  const error=document.querySelector('#track-error');
  if(!/^O\d{5}$/.test(orderId)){if(showError)error.textContent='أدخل رقم الطلب بشكل صحيح.';return;}
  if(type==='dine_in'&&!tableNumber){if(showError)error.textContent='أدخل رقم الطاولة.';return;}
  if(type==='pickup'&&phone.length<5){if(showError)error.textContent='أدخل رقم الهاتف المستخدم عند الاستلام.';return;}
  error.textContent='جاري تحديث حالة الطلب…';
  const button=document.querySelector('#track-form button');button.disabled=true;
  try{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    let response;
    try{response=await fetch('/api/orders/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(type==='dine_in'?{orderId,tableNumber}:{orderId,phone}),signal:controller.signal});}finally{clearTimeout(timer);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'تعذر العثور على الطلب.');
    renderTracking(data);
    saveLastOrder(data,{orderType:type,tableNumber,phone});
    error.textContent='';
  }catch(e){error.textContent=e.name==='AbortError'?'انتهت مهلة الاتصال.':(e.message||'تعذر تحديث حالة الطلب.');}
  finally{button.disabled=false;}
}
function openTracking(orderId){
  const last=readLastOrder();const saved=readCheckout();const type=last?.orderType||saved.orderType||'dine_in';
  document.querySelector('#track-id').value=orderId||last?.id||'';
  document.querySelector('#track-type').value=type;
  document.querySelector('#track-table').value=last?.tableNumber||saved.tableNumber||'';
  document.querySelector('#track-phone').value=last?.phone||saved.phone||'';
  syncTrackingTypeUI();
  document.querySelector('#cart-track').classList.add('show');
  clearInterval(trackingTimer);
  trackingTimer=setInterval(function(){if(document.querySelector('#cart-track')?.classList.contains('show'))void fetchTracking(false);},20000);
  if(document.querySelector('#track-id').value&&(type==='dine_in'?document.querySelector('#track-table').value:document.querySelector('#track-phone').value))void fetchTracking(false);
}
function closeTracking(){clearInterval(trackingTimer);trackingTimer=null;closeModal('#cart-track');}
async function submitOrder(event){
  event.preventDefault();if(!cart.length)return;
  const status=document.querySelector('#cart-form-status');const submit=document.querySelector('#cart-submit');
  const orderType=document.querySelector('#cart-order-type')?.value||'dine_in';
  const tableNumber=String(document.querySelector('#cart-table')?.value||'').trim();
  const name=String(document.querySelector('#cart-name')?.value||'').trim();
  const phone=String(document.querySelector('#cart-phone')?.value||'').trim();
  const notes=String(document.querySelector('#cart-notes')?.value||'').trim();
  if(orderType==='dine_in'&&!tableNumber){status.textContent='يرجى إدخال رقم الطاولة.';return;}
  if(orderType==='pickup'&&(name.length<2||phone.length<5)){status.textContent='يرجى إدخال الاسم ورقم الهاتف للاستلام.';return;}
  persistCheckout();submit.disabled=true;status.textContent='جاري إرسال الطلب…';
  try{
    const payload={orderType,tableNumber:orderType==='dine_in'?tableNumber:'',name:orderType==='pickup'?name:'',phone:orderType==='pickup'?phone:'',notes,items:cart.map(item=>({productId:item.id,quantity:item.qty}))};
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);let response;
    try{response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});}finally{clearTimeout(timer);}
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'تعذر إرسال الطلب.');
    saveLastOrder(data,{orderType,tableNumber,name,phone});window.ARABISK_CART?.clear?.();cart=readCart();document.querySelector('#cart-form').reset();syncCheckoutFields();render();status.textContent='';showSuccess(data);
  }catch(e){status.textContent=e.name==='AbortError'?'انتهت مهلة الاتصال.':(e.message||'تعذر إرسال الطلب.');}finally{submit.disabled=false;}
}
document.querySelector('#cart-clear').addEventListener('click',function(){if(!cart.length)return;if(window.confirm('هل تريد إفراغ السلة؟')){cart=[];window.ARABISK_CART?.clear?.();cart=readCart();render();}});
document.querySelector('#cart-track-last').addEventListener('click',function(){openTracking();});
document.querySelector('#cart-items').addEventListener('click',function(event){const inc=event.target.closest('[data-inc]');const dec=event.target.closest('[data-dec]');const remove=event.target.closest('[data-remove]');const id=inc?.dataset.inc||dec?.dataset.dec||remove?.dataset.remove;if(!id)return;const item=cart.find(row=>row.id===id);if(!item)return;if(remove)setQty(id,0);else setQty(id,item.qty+(inc?1:-1));});
document.querySelector('#cart-form').addEventListener('submit',submitOrder);
document.querySelector('#cart-order-type').addEventListener('change',function(){syncOrderTypeUI();persistCheckout();});
['cart-table','cart-name','cart-phone'].forEach(function(id){document.querySelector('#'+id)?.addEventListener('input',persistCheckout);});
document.querySelector('#track-type').addEventListener('change',function(){syncTrackingTypeUI();});
document.querySelector('#track-table').addEventListener('input',function(){});
document.querySelector('#track-phone').addEventListener('input',function(){});
document.querySelector('#success-track').addEventListener('click',function(){const id=document.querySelector('#success-order-id').textContent;closeModal('#cart-success');openTracking(id);});
document.querySelector('#track-form').addEventListener('submit',function(event){event.preventDefault();void fetchTracking(true);});
document.querySelector('#track-refresh').addEventListener('click',function(){void fetchTracking(true);});
window.addEventListener('arabisk-cart-updated',()=>{cart=readCart();render();});
window.addEventListener('storage',event=>{if(event.key==='arabisk-cart-v4'){cart=readCart();render();}});
document.querySelector('#track-close').addEventListener('click',closeTracking);
document.querySelector('#cart-success').addEventListener('click',function(event){if(event.target.id==='cart-success')closeModal('#cart-success');});
document.addEventListener('keydown',function(event){if(event.key==='Escape'){closeModal('#cart-success');closeTracking();}});
syncCheckoutFields();render();
})();