(() => {
'use strict';

const CART_KEY='arabisk-cart-v4';
const COOKIE_KEY='arabisk_cart_v4';
const CART_EVENT='arabisk-cart-updated';
const SESSION_KEY='arabisk-session-v1';
const getSessionId=()=>{try{let id=localStorage.getItem(SESSION_KEY);if(!id){id=(crypto.randomUUID?.()||('s-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem(SESSION_KEY,id)}return id}catch{return 'session-'+Date.now()}};
const track=(eventName,data={})=>{try{fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({eventName,sessionId:getSessionId(),...data})}).catch(()=>{})}catch{}};
const cartValue=items=>items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.qty)||0),0);
const CART_ICON='<svg class="app-cart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 5.5h2l1.7 9.1a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 1.9-1.4l1.6-6.3H7.1"></path><path d="M10 19.5h.01M17 19.5h.01"></path></svg>';
const cleanupLegacyCart=()=>{for(const key of ['arabisk-cart-v1','arabisk-cart-v2','arabisk-cart-v3']){try{localStorage.removeItem(key)}catch{}try{sessionStorage.removeItem(key)}catch{}}for(const key of ['arabisk_cart_v1','arabisk_cart_v2','arabisk_cart_v3']){try{document.cookie=key+'=; Path=/; Max-Age=0; SameSite=Lax'}catch{}}};

const normalizeItem=item=>{
  if(!item||item.id==null)return null;
  const qty=Number(item.qty);
  if(!Number.isFinite(qty)||qty<=0)return null;
  const rawPrice=Number(item.price);
  const hasPrice=Number.isFinite(rawPrice)&&rawPrice>=0;
  return {
    id:String(item.id),
    nameAr:String(item.nameAr||item.nameEn||item.name||item.id||'صنف'),
    nameEn:String(item.nameEn||''),
    price:hasPrice?rawPrice:0,
    imageUrl:String(item.imageUrl||item.image||''),
    qty:Math.min(20,Math.max(1,Math.round(qty))),
    hydrated:hasPrice
  };
};

const normalizeItems=value=>{
  const items=Array.isArray(value)?value:(value&&Array.isArray(value.items)?value.items:[]);
  return items.map(normalizeItem).filter(Boolean);
};

const readStored=(storage,key)=>{
  try{
    const raw=storage.getItem(key);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return {updatedAt:Number(parsed?.updatedAt)||0,items:normalizeItems(parsed)};
  }catch{return null}
};

const readCookie=()=>{
  try{
    const match=document.cookie.split('; ').find(row=>row.startsWith(COOKIE_KEY+'='));
    if(!match)return null;
    const encoded=match.slice(COOKIE_KEY.length+1);
    const decoded=decodeURIComponent(encoded);
    const parsed=JSON.parse(decoded);
    return {updatedAt:Number(parsed?.updatedAt)||0,items:normalizeItems(parsed.items||parsed)};
  }catch{return null}
};

const readCart=()=>{
  const candidates=[];
  try{const value=readStored(localStorage,CART_KEY);if(value)candidates.push(value)}catch{}
  try{const value=readStored(sessionStorage,CART_KEY);if(value)candidates.push(value)}catch{}
  try{const value=readCookie();if(value)candidates.push(value)}catch{}
  if(!candidates.length)return [];
  // Prefer equally fresh storage snapshots over the metadata-light cookie fallback.
  candidates.sort((a,b)=>b.updatedAt-a.updatedAt);
  const newestTimestamp=candidates[0].updatedAt;
  const equallyFresh=candidates.filter(candidate=>candidate.updatedAt===newestTimestamp);
  const rich=equallyFresh.find(candidate=>candidate.items.some(item=>item.hydrated&&item.nameAr&&item.nameAr!==item.id));
  return (rich||equallyFresh[0]).items;
};const writeCookie=(items,updatedAt)=>{
  try{
    const compact={version:1,updatedAt:Number(updatedAt)||Date.now(),items:items.map(item=>({id:String(item.id),qty:Number(item.qty)||1}))};
    const encoded=encodeURIComponent(JSON.stringify(compact));
    if(encoded.length>3800)return false;
    document.cookie=COOKIE_KEY+'='+encoded+'; Path=/; Max-Age=2592000; SameSite=Lax';
    return document.cookie.includes(COOKIE_KEY+'=');
  }catch{return false}
};

const saveCart=items=>{
  const normalized=normalizeItems(items);
  const updatedAt=Date.now();
  const payload=JSON.stringify({version:4,updatedAt,items:normalized});
  let persisted=false;
  try{localStorage.setItem(CART_KEY,payload);persisted=true}catch{}
  try{sessionStorage.setItem(CART_KEY,payload);persisted=true}catch{}
  const cookiePersisted=writeCookie(normalized,updatedAt);
  persisted=persisted||cookiePersisted;
  window.dispatchEvent(new CustomEvent(CART_EVENT,{detail:{items:normalized,persisted}}));
  return normalized;
};

let cart=readCart();
let toastTimer=null;
let hydrationPromise=null;

function ensureStyles(){
  if(document.querySelector('#arabisk-cart-core-style'))return;
  const style=document.createElement('style');
  style.id='arabisk-cart-core-style';
  style.textContent='.ac-fab{position:fixed;left:22px;bottom:22px;width:60px;height:60px;display:grid;place-items:center;border:1px solid #3a3125;border-radius:50%;background:#0d0d0d;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.22);z-index:10010;text-decoration:none;font-size:22px}.ac-fab b{position:absolute;top:-5px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:50%;background:#b89455;color:#fff;display:flex;align-items:center;justify-content:center;font:700 11px Cairo,sans-serif}.ac-toast{position:fixed;right:22px;bottom:22px;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 44px));padding:11px 13px;border:1px solid rgba(184,148,85,.35);border-radius:15px;background:rgba(17,17,17,.96);color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.22);z-index:140;font:12px Cairo,sans-serif;opacity:0;transform:translateY(10px);pointer-events:none;transition:.22s}.ac-toast.show{opacity:1;transform:translateY(0)}.ac-toast a{padding:7px 11px;border-radius:999px;background:#b89455;color:#111;text-decoration:none;font-weight:800;white-space:nowrap}@media(max-width:560px){.ac-toast{right:14px;left:14px;max-width:none;justify-content:space-between}}@media(max-width:800px){.ac-toast{bottom:calc(82px + env(safe-area-inset-bottom));z-index:10006;max-width:none}}
@media(max-width:800px){.ac-fab{left:14px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:10010;width:58px;height:58px}}';
  document.head.appendChild(style);
}

function syncHeaderCart(){
  const link=document.querySelector('.app-cart-link');
  if(!link)return;
  let badge=link.querySelector('b');
  if(!badge){
    badge=document.createElement('b');
    badge.id='app-cart-count';
    badge.hidden=true;
    link.appendChild(badge);
  }
  link.setAttribute('aria-label','فتح السلة');
  link.innerHTML='';
  link.appendChild(document.createRange().createContextualFragment(CART_ICON));
  link.appendChild(badge);
}
function ensureFloatingCart(){
  if(location.pathname==='/cart'||document.querySelector('.app-cart-link')||document.querySelector('#arabisk-cart-open'))return;
  ensureStyles();
  const a=document.createElement('a');
  a.id='arabisk-cart-open';
  a.className='ac-fab';
  a.href='/cart';
  a.setAttribute('aria-label','فتح السلة');
  a.innerHTML='🛒<b id="arabisk-cart-count" hidden>0</b>';
  document.body.appendChild(a);
}

function renderBadge(){
  const quantity=cart.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
  document.querySelectorAll('#arabisk-cart-count, #app-cart-count, .app-cart-link b').forEach(badge=>{
    badge.textContent=String(quantity);
    badge.hidden=quantity===0;
  });
}

function showToast(item,qty){
  let toast=document.querySelector('#arabisk-cart-toast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='arabisk-cart-toast';
    toast.className='ac-toast';
    toast.innerHTML='<span></span><a href="/cart">عرض السلة</a>';
    document.body.appendChild(toast);
  }
  toast.querySelector('span').textContent='تمت إضافة '+(qty>1?qty+' × ':'')+String(item?.nameAr||item?.nameEn||'الصنف')+' إلى طلبك';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),3800);
}

async function hydrateCart(){
  const source=readCart();
  if(!source.length||source.every(item=>item.hydrated))return source;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch('/api/products',{cache:'no-store',signal:controller.signal});
      const products=await response.json().catch(()=>[]);
      if(!response.ok||!Array.isArray(products))return source;
      const hydrated=source.map(item=>{
        const product=products.find(row=>String(row.id)===String(item.id));
        return product?normalizeItem({...product,qty:item.qty}):item;
      });
      cart=saveCart(hydrated);
      renderBadge();
      return cart;
    }finally{clearTimeout(timer);}
  }catch{return source}
}

function ready(){
  if(hydrationPromise)return hydrationPromise;
  hydrationPromise=hydrateCart().finally(()=>{hydrationPromise=null});
  return hydrationPromise;
}

function add(item,quantity=1){
  const normalized=normalizeItem({...item,qty:1});
  if(!normalized)return false;
  const qty=Math.max(1,Math.min(20,Math.round(Number(quantity)||1)));
  cart=readCart();
  const found=cart.find(row=>row.id===normalized.id);
  if(found)found.qty=Math.min(20,Number(found.qty||0)+qty);
  else cart.push({...normalized,qty});
  cart=saveCart(cart);
  renderBadge();
  showToast(normalized,qty);
  track('add_to_cart',{productId:normalized.id,cartValue:cartValue(cart),cartItems:cart.map(item=>({productId:item.id,quantity:Number(item.qty)||1}))});
  return true;
}

function setQuantity(id,next){
  const key=String(id??'');
  if(!key)return false;
  cart=readCart();
  const item=cart.find(row=>row.id===key);
  if(!item)return false;
  if(Number(next)<=0)cart=cart.filter(row=>row.id!==key);
  else item.qty=Math.min(20,Math.max(1,Math.round(Number(next)||1)));
  cart=saveCart(cart);
  renderBadge();
  track('cart_updated',{cartValue:cartValue(cart),cartItems:cart.map(item=>({productId:item.id,quantity:Number(item.qty)||1}))});
  return true;
}

function clear(){
  cart=saveCart([]);
  renderBadge();
  track('cart_updated',{cartValue:0,cartItems:[]});
}

function open(){window.location.assign('/cart')}
function render(){cart=readCart();renderBadge();return cart}
function mount(){cleanupLegacyCart();syncHeaderCart();ensureFloatingCart();render();if(location.pathname==='/menu'||location.pathname.startsWith('/menu/'))track('menu_view')}

window.ARABISK_ANALYTICS={track,getSessionId};
window.ARABISK_CART={
  add,
  open,
  render,
  clear,
  ready,
  getItems:()=>readCart(),
  setItems:items=>{cart=saveCart(Array.isArray(items)?items:[]);renderBadge();return cart},
  setQuantity
};
window.ARABISK_CART_READY=ready();

window.addEventListener(CART_EVENT,()=>{cart=readCart();renderBadge()});
window.addEventListener('storage',event=>{if(event.key===CART_KEY){cart=readCart();renderBadge()}});
window.addEventListener('pageshow',()=>{cart=readCart();renderBadge();void ready()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();

})();