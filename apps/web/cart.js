const CART_KEY='arabisk-cart-v1';

const readJson=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value??fallback}catch{return fallback}};
const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const readCart=()=>{const value=readJson(CART_KEY,[]);return Array.isArray(value)?value.filter(item=>item&&item.id&&Number(item.price)>=0&&Number(item.qty)>0).map(item=>({...item,id:String(item.id),price:Number(item.price)||0,qty:Math.min(20,Math.max(1,Number(item.qty)||1)),nameAr:String(item.nameAr||item.nameEn||''),imageUrl:String(item.imageUrl||'')})):[]};
const saveCart=items=>writeJson(CART_KEY,items);

let cart=readCart();
let toastTimer=null;

function ensureStyles(){
  if(document.querySelector('#arabisk-cart-core-style'))return;
  const style=document.createElement('style');
  style.id='arabisk-cart-core-style';
  style.textContent='.ac-fab{position:fixed;left:22px;bottom:22px;width:60px;height:60px;display:grid;place-items:center;border:1px solid #3a3125;border-radius:50%;background:#0d0d0d;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.22);z-index:80;text-decoration:none;font-size:22px}.ac-fab b{position:absolute;top:-5px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:50%;background:#b89455;color:#fff;display:flex;align-items:center;justify-content:center;font:700 11px Cairo,sans-serif}.ac-toast{position:fixed;right:22px;bottom:22px;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 44px));padding:11px 13px;border:1px solid rgba(184,148,85,.35);border-radius:15px;background:rgba(17,17,17,.96);color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.22);z-index:140;font:12px Cairo,sans-serif;opacity:0;transform:translateY(10px);pointer-events:none;transition:.22s}.ac-toast.show{opacity:1;transform:translateY(0)}.ac-toast a{padding:7px 11px;border-radius:999px;background:#b89455;color:#111;text-decoration:none;font-weight:800;white-space:nowrap}@media(max-width:560px){.ac-toast{right:14px;left:14px;max-width:none;justify-content:space-between}}';
  document.head.appendChild(style);
}
function ensureFloatingCart(){
  if(location.pathname==='/cart'||document.querySelector('#arabisk-cart-open'))return;
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
  const badge=document.querySelector('#arabisk-cart-count');if(!badge)return;
  const quantity=cart.reduce((sum,item)=>sum+(Number(item.qty)||0),0);
  badge.textContent=String(quantity);badge.hidden=quantity===0;
}
function showToast(item,qty){
  let toast=document.querySelector('#arabisk-cart-toast');
  if(!toast){toast=document.createElement('div');toast.id='arabisk-cart-toast';toast.className='ac-toast';toast.innerHTML='<span></span><a href="/cart">عرض السلة</a>';document.body.appendChild(toast);}
  toast.querySelector('span').textContent='تمت إضافة '+(qty>1?qty+' × ':'')+String(item?.nameAr||item?.nameEn||'الصنف')+' إلى طلبك';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),3800);
}
function add(item,quantity=1){
  if(!item?.id)return;
  const id=String(item.id);
  const qty=Math.max(1,Math.min(20,Number(quantity)||1));
  const found=cart.find(row=>row.id===id);
  if(found)found.qty=Math.min(20,found.qty+qty);
  else cart.push({id,nameAr:String(item.nameAr||item.nameEn||''),price:Math.max(0,Number(item.price)||0),imageUrl:String(item.imageUrl||''),qty});
  saveCart(cart);
  renderBadge();
  showToast(item,qty);
}
function clear(){cart=[];saveCart(cart);renderBadge()}
function open(){window.location.assign('/cart')}
function render(){cart=readCart();renderBadge()}
function mount(){ensureFloatingCart();render()}
window.ARABISK_CART={add,open,render,clear};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();