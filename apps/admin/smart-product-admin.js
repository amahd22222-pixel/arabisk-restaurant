const apiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));

const style=document.createElement('style');
style.textContent=`
.smart-product-section{margin:18px 0 4px;padding:16px;border:1px solid #ded6c8;border-radius:16px;background:#fbf8f2}
.smart-product-section>strong{display:block;font-size:14px;margin-bottom:4px}
.smart-product-section>p{margin:0 0 14px;color:#817a6e;font-size:11px;line-height:1.8}
.smart-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.smart-product-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#5e584f}
.smart-product-field select{height:40px;border:1px solid #ded6c8;border-radius:10px;background:#fff;padding:0 10px;font:inherit}
.smart-product-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.smart-product-check{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #ded6c8;border-radius:10px;background:#fff;font-size:12px;color:#3f3a34}
.smart-product-check input{accent-color:#b89455}
.smart-popular-note{margin-top:10px;padding:9px 11px;border-radius:10px;background:#fff7e8;color:#8a672e;font-size:11px}
@media(max-width:620px){.smart-product-grid,.smart-product-checks{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

function request(path,options={}){return fetch(`${apiBase()}${path}`,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'تعذر تحميل بيانات الصنف');return data;});}

function ensureSmartFields(){
  const form=document.querySelector('#product-form');
  if(!form||document.querySelector('#smart-product-section'))return false;
  const section=document.createElement('section');
  section.id='smart-product-section';
  section.className='smart-product-section';
  section.innerHTML=`
    <strong>خصائص المنيو الذكية</strong>
    <p>هذه الخصائص تظهر للعميل داخل المنيو. «الأكثر طلبًا» يُحتسب تلقائيًا من الطلبات ولا يحتاج إلى تفعيل يدوي.</p>
    <div class="smart-product-grid">
      <label class="smart-product-field">مستوى الحِدة
        <select id="smart-spice-level">
          <option value="0">غير حار</option>
          <option value="1">🌶️ خفيف</option>
          <option value="2">🌶️🌶️ متوسط</option>
          <option value="3">🌶️🌶️🌶️ حار</option>
        </select>
      </label>
    </div>
    <div class="smart-product-checks">
      <label class="smart-product-check"><input id="smart-spicy" type="checkbox"> حار</label>
      <label class="smart-product-check"><input id="smart-vegetarian" type="checkbox"> نباتي</label>
      <label class="smart-product-check"><input id="smart-vegan" type="checkbox"> نباتي بالكامل</label>
      <label class="smart-product-check"><input id="smart-gluten-free" type="checkbox"> بدون جلوتين</label>
      <label class="smart-product-check"><input id="smart-chef-choice" type="checkbox"> Chef's Choice</label>
      <label class="smart-product-check"><input id="smart-is-new" type="checkbox"> جديد</label>
    </div>
    <div id="smart-popular-note" class="smart-popular-note">🔥 «الأكثر طلبًا» سيظهر تلقائيًا عند دخول الصنف ضمن أكثر 6 أصناف طلبًا خلال آخر 7 أيام.</div>
  `;
  const availability=document.querySelector('#available')?.closest('label');
  if(availability)form.insertBefore(section,availability);else form.appendChild(section);
  return true;
}

function readSmartFields(){
  ensureSmartFields();
  const dietary=[];
  if(document.querySelector('#smart-vegetarian')?.checked)dietary.push('vegetarian');
  if(document.querySelector('#smart-vegan')?.checked)dietary.push('vegan');
  if(document.querySelector('#smart-gluten-free')?.checked)dietary.push('gluten-free');
  const tags=document.querySelector('#smart-spicy')?.checked?['spicy']:[];
  return {spiceLevel:Number(document.querySelector('#smart-spice-level')?.value||0),tags,dietary,chefChoice:Boolean(document.querySelector('#smart-chef-choice')?.checked),isNew:Boolean(document.querySelector('#smart-is-new')?.checked)};
}

function writeSmartFields(product={}){
  ensureSmartFields();
  const smart=product.smart||{};
  const tags=new Set(Array.isArray(product.tags)?product.tags:smart.tags||[]);
  const dietary=new Set(Array.isArray(product.dietary)?product.dietary:smart.dietary||[]);
  document.querySelector('#smart-spice-level').value=String(product.spiceLevel??smart.spiceLevel??0);
  document.querySelector('#smart-spicy').checked=tags.has('spicy')||Boolean(smart.spicy);
  document.querySelector('#smart-vegetarian').checked=dietary.has('vegetarian')||Boolean(smart.vegetarian);
  document.querySelector('#smart-vegan').checked=dietary.has('vegan')||Boolean(smart.vegan);
  document.querySelector('#smart-gluten-free').checked=dietary.has('gluten-free')||Boolean(smart.glutenFree);
  document.querySelector('#smart-chef-choice').checked=Boolean(product.chefChoice??smart.chefChoice);
  document.querySelector('#smart-is-new').checked=Boolean(product.isNew??smart.isNew);
  const note=document.querySelector('#smart-popular-note');
  if(note)note.textContent=smart.popular?'🔥 هذا الصنف محسوب حاليًا ضمن الأكثر طلبًا خلال آخر 7 أيام.':'🔥 «الأكثر طلبًا» سيظهر تلقائيًا عند دخول الصنف ضمن أكثر 6 أصناف طلبًا خلال آخر 7 أيام.';
}

function resetSmartFields(){writeSmartFields({spiceLevel:0,tags:[],dietary:[],chefChoice:false,isNew:false,smart:{popular:false}});}

const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:(input?.url||'');
  const isProductMutation=/\/api\/products(?:\/[^/?#]+)?$/.test(url)&&['POST','PATCH'].includes(String(init.method||'GET').toUpperCase());
  if(isProductMutation&&typeof init.body==='string'){
    try{const body=JSON.parse(init.body);Object.assign(body,readSmartFields());init={...init,body:JSON.stringify(body)};}catch(error){console.warn('ARABISK smart product payload skipped:',error);}
  }
  return originalFetch(input,init);
};

document.addEventListener('click',event=>{
  if(event.target.closest('#add-product')){setTimeout(resetSmartFields,0);return;}
  const edit=event.target.closest('[data-edit]');
  if(!edit)return;
  const id=edit.dataset.edit;
  setTimeout(async()=>{
    try{const product=await request(`/api/products/${encodeURIComponent(id)}`);writeSmartFields(product);}catch(error){console.warn('ARABISK smart fields load failed:',error);}
  },40);
});

document.addEventListener('DOMContentLoaded',()=>{ensureSmartFields();});
ensureSmartFields();
