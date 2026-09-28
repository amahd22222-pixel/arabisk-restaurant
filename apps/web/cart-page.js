(() => {
'use strict';

const CHECKOUT_KEY='arabisk-checkout-v3';
const LAST_ORDER_KEY='arabisk-last-order-v1';
const PROMO_STORAGE_KEY='arabisk-active-promo-v1';
const PENDING_ORDER_KEY='arabisk-pending-order-v1';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const readCart=()=>window.ARABISK_CART?.getItems?.()||[];
const readProfile=()=>window.ARABISK_PROFILE?.getProfile?.()||null;
const getPwaClientId=()=>{try{return String(localStorage.getItem('ARABISK_PWA_CLIENT_ID')||'').trim().slice(0,100)}catch{return ''}};
const profileCustomerId=()=>String(readProfile()?.id||'').trim();
const isStandaloneMode=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
const readPendingOrder=()=>{try{const value=JSON.parse(sessionStorage.getItem(PENDING_ORDER_KEY)||'null');return value&&value.key&&value.fingerprint?value:null}catch{return null}};
const savePendingOrder=value=>{try{sessionStorage.setItem(PENDING_ORDER_KEY,JSON.stringify(value))}catch{}};
const clearPendingOrder=()=>{try{sessionStorage.removeItem(PENDING_ORDER_KEY)}catch{}};
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
let cart=readCart();
let promoCode='';
let promoQuote=null;
try{promoCode=String(new URLSearchParams(location.search).get('promo')||sessionStorage.getItem(PROMO_STORAGE_KEY)||localStorage.getItem('ARABISK_INSTALL_REWARD_CODE')||'').trim().toUpperCase().slice(0,80)}catch{}
let recoveryToken=new URLSearchParams(location.search).get('recover')||'';
let recoveryRestorePromise=null;
let pendingOrderFingerprint='';
let pendingOrderIdempotencyKey=readPendingOrder()?.key||'';

const createOrderIdempotencyKey = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
};
const total=()=>cart.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
const count=()=>cart.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
const money=value=>'AED '+Number(value||0).toFixed(0);

async function restoreRecoveryCart(){
  if(recoveryRestorePromise)return recoveryRestorePromise;
  if(!recoveryToken)return null;
  recoveryRestorePromise=(async()=>{
    try{
      const response=await fetch('/api/revenue/recovery/'+encodeURIComponent(recoveryToken),{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||'تعذر استرجاع السلة.');
      if(!Array.isArray(data.items)||!data.items.length)throw new Error('السلة المسترجعة فارغة.');
      window.ARABISK_CART?.setItems?.(data.items.map(item=>({id:item.id,qty:item.qty})));
      cart=await hydrateCartView();
      const status=document.querySelector('#cart-form-status');
      if(status)status.textContent='تم استرجاع سلتك السابقة. يمكنك إكمال الطلب الآن.';
      return true;
    }catch(error){
      const status=document.querySelector('#cart-form-status');
      if(status)status.textContent=error.message||'تعذر استرجاع السلة.';
      return false;
    }
  })();
  return recoveryRestorePromise;
}
function syncCheckoutFields(){const saved=readCheckout();const profile=readProfile();const type=document.querySelector('#cart-order-type');const table=document.querySelector('#cart-table');const name=document.querySelector('#cart-name');const phone=document.querySelector('#cart-phone');if(type)type.value=saved.orderType||'dine_in';if(table)table.value=saved.tableNumber||'';if(name)name.value=saved.name||profile?.name||'';if(phone)phone.value=saved.phone||profile?.phone||'';syncOrderTypeUI();}
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

function emptyMarkup(){return '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><h2>السلة فارغة</h2><p>لم تضف أي صنف بعد. تصفّح المنيو واختر أطباقك، ثم ارجع هنا لإكمال الطلب.</p><a class="cart-primary" href="/menu">استكشف المنيو</a></div>';}
function render(){const items=document.querySelector('#cart-items');const mobileDock=document.querySelector('#mobile-checkout-dock');const mobileTotal=document.querySelector('#mobile-checkout-total');const countLabel=document.querySelector('#cart-count-label');const summaryCount=document.querySelector('#cart-summary-count');const summarySubtotal=document.querySelector('#cart-summary-subtotal');const summaryDiscount=document.querySelector('#cart-summary-discount');const summaryDiscountRow=document.querySelector('#cart-summary-discount-row');const summaryTotal=document.querySelector('#cart-summary-total');const formWrap=document.querySelector('#cart-form-wrap');const emptySummary=document.querySelector('#cart-empty-summary');const clearButton=document.querySelector('#cart-clear');const trackLast=document.querySelector('#cart-track-last');const last=readLastOrder();const itemCount=count();if(countLabel)countLabel.textContent=itemCount?itemCount+' '+(itemCount===1?'صنف':'أصناف'):'لا توجد أصناف';if(summaryCount)summaryCount.textContent=String(itemCount);if(summarySubtotal)summarySubtotal.textContent=money(total());if(summaryDiscountRow)summaryDiscountRow.hidden=!promoQuote||Number(promoQuote.discount||0)<=0;if(summaryDiscount)summaryDiscount.textContent=promoQuote?'- '+money(promoQuote.discount):'- AED 0';if(summaryTotal)summaryTotal.textContent=money(promoQuote?.total??total());if(formWrap)formWrap.hidden=!cart.length;if(mobileDock)mobileDock.hidden=!cart.length;if(mobileTotal)mobileTotal.textContent=money(promoQuote?.total??total());if(emptySummary)emptySummary.hidden=Boolean(cart.length);if(clearButton)clearButton.hidden=!cart.length;if(trackLast){trackLast.hidden=!last;trackLast.textContent=last?'متابعة '+last.id:'متابعة آخر طلب';}if(!items)return;if(!cart.length){items.innerHTML=emptyMarkup();return;}items.innerHTML=cart.map(item=>'<article class="cart-item"><img class="cart-item-image" src="'+esc(item.imageUrl||'')+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><div class="cart-item-copy"><h3 class="cart-item-name">'+esc(item.nameAr)+'</h3><p class="cart-item-price">'+money(item.price)+' للصنف</p><div class="cart-item-total">'+money(Number(item.price)*Number(item.qty))+'</div></div><div class="cart-item-actions"><div class="cart-qty"><button type="button" data-inc="'+esc(item.id)+'" aria-label="زيادة الكمية">+</button><span>'+Number(item.qty)+'</span><button type="button" data-dec="'+esc(item.id)+'" aria-label="إنقاص الكمية">−</button></div><button class="cart-remove" type="button" data-remove="'+esc(item.id)+'">حذف الصنف</button></div></article>').join('');}
function setQty(id,next){if(!window.ARABISK_CART?.setQuantity?.(id,next))return;cart=readCart();render();if(promoCode&&cart.length)void refreshPromoQuote(false);}
async function ensureInstallRewardCode(){
  if(!isStandaloneMode())return '';
  const clientId=getPwaClientId();
  if(!clientId)return '';
  try{
    const response=await fetch('/api/promotions/install/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return '';
    if(data?.code){
      promoCode=String(data.code).trim().toUpperCase();
      try{
        localStorage.setItem('ARABISK_INSTALL_REWARD_CODE',promoCode);
        localStorage.setItem('ARABISK_INSTALL_REWARD_META_V1',JSON.stringify({expiresAt:data.expiresAt||'',discountValue:data.discountValue||0,status:data.status||'available'}));
        sessionStorage.setItem(PROMO_STORAGE_KEY,promoCode);
      }catch{}
      return promoCode;
    }
    if(['redeemed','expired'].includes(data?.status)){
      promoCode='';
      promoQuote=null;
      try{
        localStorage.removeItem('ARABISK_INSTALL_REWARD_CODE');
        localStorage.removeItem('ARABISK_INSTALL_REWARD_META_V1');
        sessionStorage.removeItem(PROMO_STORAGE_KEY);
      }catch{}
    }
  }catch{}
  return '';
}
async function refreshPromoQuote(showErrors=true, retrying=false){
  const input=document.querySelector('#cart-promo-code');
  const status=document.querySelector('#cart-promo-status');
  promoCode=String(input?.value||promoCode||'').trim().toUpperCase().slice(0,80);
  if(input)input.value=promoCode;
  if(!promoCode&&isStandaloneMode()) promoCode=await ensureInstallRewardCode();
  if(!promoCode||!cart.length){promoQuote=null;render();if(status)status.textContent='';return false;}
  try{
    const response=await fetch('/api/promotions/install/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:promoCode,subtotal:total(),clientId:getPwaClientId()}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'كود الخصم غير صالح.');
    promoQuote=data;
    if(status)status.textContent='تم تطبيق خصم '+Number(data.discountValue||0)+'% — وفرت '+money(data.discount);
    try{sessionStorage.setItem(PROMO_STORAGE_KEY,promoCode)}catch{}
    render();
    return true;
  }catch(error){
    if(!retrying&&isStandaloneMode()){
      const recovered=await ensureInstallRewardCode();
      if(recovered) return refreshPromoQuote(showErrors,true);
    }
    promoQuote=null;
    if(status&&showErrors)status.textContent=error.message||'تعذر تطبيق كود الخصم.';
    render();
    return false;
  }
}
function showSuccess(data){document.querySelector('#success-order-id').textContent=data?.id||'—';document.querySelector('#success-order-total').textContent=money(data?.total);document.querySelector('#cart-success').classList.add('show');}
function closeModal(id){document.querySelector(id)?.classList.remove('show');}
async function submitOrder(event){
  event.preventDefault();if(!cart.length)return;
  if(navigator.onLine===false){
    const offlineStatus=document.querySelector('#cart-form-status');
    if(offlineStatus)offlineStatus.textContent='لا يمكن إرسال الطلب بدون اتصال بالإنترنت. أعد المحاولة عند عودة الاتصال.';
    return;
  }
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
    const sessionId=window.ARABISK_ANALYTICS?.getSessionId?.()||'';window.ARABISK_ANALYTICS?.track?.('checkout_started',{cartValue:total(),cartItems:cart.map(item=>({productId:item.id,quantity:Number(item.qty)||1})),metadata:{orderType}});
    const payload={
      orderType,
      tableNumber:orderType==='dine_in'?tableNumber:'',
      name:orderType==='pickup'?name:'',
      phone:orderType==='pickup'?phone:'',
      notes,
      sessionId,
      customerId:profileCustomerId(),
      clientId:getPwaClientId(),
      recoveryToken,
      promoCode:promoCode||'',
      items:cart.map(item=>({productId:item.id,quantity:item.qty}))
    };
    const fingerprint=JSON.stringify(payload);
    const storedPending=readPendingOrder();
    if(storedPending?.fingerprint===fingerprint){
      pendingOrderFingerprint=fingerprint;
      pendingOrderIdempotencyKey=storedPending.key;
    }else{
      pendingOrderFingerprint=fingerprint;
      pendingOrderIdempotencyKey=createOrderIdempotencyKey();
      savePendingOrder({key:pendingOrderIdempotencyKey,fingerprint});
    }
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);let response;
    try{response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,idempotencyKey:pendingOrderIdempotencyKey}),signal:controller.signal});}finally{clearTimeout(timer);}
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'تعذر إرسال الطلب.');
    saveLastOrder(data,{orderType,tableNumber,name,phone});
    pendingOrderFingerprint='';
    pendingOrderIdempotencyKey='';
    clearPendingOrder();
    window.ARABISK_CART?.clear?.();cart=readCart();document.querySelector('#cart-form').reset();promoCode='';promoQuote=null;try{sessionStorage.removeItem(PROMO_STORAGE_KEY);localStorage.removeItem('ARABISK_INSTALL_REWARD_CODE')}catch{}syncCheckoutFields();render();status.textContent='';showSuccess(data);
  }catch(e){status.textContent=e.name==='AbortError'?'انتهت مهلة الاتصال.':(e.message||'تعذر إرسال الطلب.');}finally{submit.disabled=false;}
}
document.querySelector('#cart-promo-apply')?.addEventListener('click',()=>void refreshPromoQuote(true));
document.querySelector('#cart-promo-code')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void refreshPromoQuote(true);}});
document.querySelector('#cart-clear')?.addEventListener('click',function(){if(!cart.length)return;if(window.confirm('هل تريد إفراغ السلة؟')){cart=[];window.ARABISK_CART?.clear?.();cart=readCart();render();}});
document.querySelector('#cart-items')?.addEventListener('click',function(event){const inc=event.target.closest('[data-inc]');const dec=event.target.closest('[data-dec]');const remove=event.target.closest('[data-remove]');const id=inc?.dataset.inc||dec?.dataset.dec||remove?.dataset.remove;if(!id)return;const item=cart.find(row=>row.id===id);if(!item)return;if(remove)setQty(id,0);else setQty(id,item.qty+(inc?1:-1));});
document.querySelector('#cart-form')?.addEventListener('submit',submitOrder);
document.querySelector('#mobile-checkout-submit')?.addEventListener('click',()=>document.querySelector('#cart-form')?.requestSubmit());
document.querySelector('#cart-order-type')?.addEventListener('change',function(){syncOrderTypeUI();persistCheckout();});
['cart-table','cart-name','cart-phone'].forEach(function(id){document.querySelector('#'+id)?.addEventListener('input',persistCheckout);});

window.addEventListener('arabisk-cart-updated',()=>{cart=readCart();render();});
window.addEventListener('storage',event=>{if(event.key==='arabisk-cart-v4'){cart=readCart();render();}});
document.querySelector('#cart-success')?.addEventListener('click',function(event){if(event.target.id==='cart-success')closeModal('#cart-success');});
document.addEventListener('keydown',function(event){if(event.key==='Escape')closeModal('#cart-success');});
syncCheckoutFields();
void restoreRecoveryCart().then(async()=>{cart=readCart();const input=document.querySelector('#cart-promo-code');if(input)input.value=promoCode;render();if(promoCode)await refreshPromoQuote(false);});
render();
})();

window.addEventListener('arabisk:profile-updated', syncCheckoutFields);
