const $=(selector)=>document.querySelector(selector);
const apiBase=()=>((localStorage.getItem('ARABISK_API_BASE')||window.ARABISK_API_BASE||import.meta.env.VITE_API_BASE_URL||(import.meta.env.DEV?'http://localhost:3000':'/proxy')).replace(/\/$/,''));
let products=[],categories=[],orders=[],customers=[],reservations=[],customerSegments=[],editingId=null;
const categoryName=(id)=>categories.find(c=>c.id===id)?.nameAr||id;
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const orderStatusLabel={pending:'قيد المراجعة',confirmed:'مؤكد',preparing:'قيد التحضير',ready:'جاهز',completed:'مكتمل',cancelled:'ملغي'};
const statusClass=(status)=>status==='confirmed'||status==='ready'||status==='completed'?'on':status==='cancelled'?'off':'pending';
async function request(path,options={}){const response=await fetch(`${apiBase()}${path}`,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'حدث خطأ أثناء الاتصال بالخادم');return data;}
function renderStats(){$('#count-products').textContent=products.length;$('#count-categories').textContent=categories.length;$('#count-available').textContent=products.filter(p=>p.available).length;$('#count-reservations').textContent=reservations.length;$('#count-orders').textContent=orders.length;document.querySelectorAll('[data-sidebar-count="reservations"]').forEach(node=>node.textContent=reservations.length);document.querySelectorAll('[data-sidebar-count="orders"]').forEach(node=>node.textContent=orders.length);}
function renderProducts(){const query=$('#search').value.trim().toLowerCase();const filtered=products.filter(p=>!query||`${p.nameAr} ${p.nameEn}`.toLowerCase().includes(query));$('#products-body').innerHTML=filtered.map(p=>`<tr><td>${p.imageUrl?`<img class="product-thumb" src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy">`:''}<strong>${escapeHtml(p.nameAr)}</strong><small>${escapeHtml(p.nameEn)}</small></td><td>${escapeHtml(categoryName(p.categoryId))}</td><td class="price">AED ${Number(p.price).toFixed(0)}</td><td>${p.videoKey?'<span class="status on">متوفر</span>':'<span class="status off">غير مضاف</span>'}</td><td><span class="status ${p.available?'on':'off'}">${p.available?'متاح':'مخفي'}</span></td><td class="actions"><button data-video="${p.id}">فيديو</button><button data-edit="${p.id}">تعديل</button><button data-delete="${p.id}" class="danger">حذف</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">لا توجد أصناف</td></tr>';}
function renderCategories(){$('#categories-body').innerHTML=categories.map((c,index)=>`<tr><td>${index+1}</td><td><strong>${escapeHtml(c.nameAr)}</strong></td><td>${escapeHtml(c.nameEn)}</td><td><span class="status ${c.active?'on':'off'}">${c.active?'نشط':'مخفي'}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">لا توجد أقسام</td></tr>';}
function renderReservations(){const rows=reservations.map(r=>`<tr><td><strong>${escapeHtml(r.name)}</strong><small>${r.eventSlug?`فعالية: ${escapeHtml(r.eventSlug)}`:(r.notes?escapeHtml(r.notes):'—')}</small></td><td>${escapeHtml(r.date)}<small>${escapeHtml(r.time)}</small></td><td>${Number(r.guests)}</td><td dir="ltr">${escapeHtml(r.phone)}</td><td><span class="status ${r.status==='confirmed'?'on':r.status==='cancelled'?'off':'pending'}">${r.status==='confirmed'?'مؤكد':r.status==='cancelled'?'ملغي':'قيد المراجعة'}</span></td><td class="actions"><button data-res-status="confirmed" data-id="${r.id}">تأكيد</button><button data-res-status="cancelled" data-id="${r.id}" class="danger">إلغاء</button></td></tr>`).join('');$('#reservations-body').innerHTML=rows||'<tr><td colspan="6" class="empty">لا توجد حجوزات حاليًا.</td></tr>';}
function renderOrders(){const body=$('#orders-body');if(!orders.length){body.innerHTML='';$('#orders-state').textContent='لا توجد طلبات مسجلة حاليًا.';return}$('#orders-state').textContent=`${orders.length} طلب مسجل.`;body.innerHTML=orders.map(order=>{const items=(order.items||[]).map(item=>`${escapeHtml(item.nameAr)} × ${Number(item.quantity)}`).join('، ');const orderType=order.orderType==='pickup'?'استلام':'داخل المطعم';const location=order.tableNumber?`<small>طاولة ${escapeHtml(order.tableNumber)}</small>`:'';return `<tr><td><strong>${escapeHtml(order.id)}</strong><small>${new Date(order.createdAt).toLocaleString('ar-AE')}</small></td><td><strong>${escapeHtml(order.name)}</strong><small dir="ltr">${escapeHtml(order.phone)}</small></td><td><small>${items}</small></td><td class="price">AED ${Number(order.total).toFixed(0)}</td><td><strong>${orderType}</strong>${location}</td><td><span class="status ${statusClass(order.status)}">${orderStatusLabel[order.status]||order.status}</span></td><td class="actions"><select data-order-status="${escapeHtml(order.id)}"><option value="pending">قيد المراجعة</option><option value="confirmed">مؤكد</option><option value="preparing">قيد التحضير</option><option value="ready">جاهز</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option></select></td></tr>`}).join('');orders.forEach(order=>{const select=document.querySelector(`select[data-order-status="${CSS.escape(order.id)}"]`);if(select)select.value=order.status});}
function renderCustomerSegments(){
  const grid=$('#customer-segments-grid'); if(!grid)return;
  grid.innerHTML=customerSegments.map(segment=>{const m=segment.actionMetrics||{};return `<article class="customer-segment-card"><button class="segment-main" type="button" data-segment-key="${escapeHtml(segment.key)}"><span>${escapeHtml(segment.label)}</span><b>${Number(segment.count||0)}</b><small>${escapeHtml(segment.description)}</small><em>قيمة الطلبات السابقة: AED ${Number(segment.totalRevenue||0).toFixed(0)}</em></button><div class="segment-performance"><span>الإجراءات ${Number(m.drafts||0)}</span><span>تنفيذ ${Number(m.executed||0)}</span><span>تحول ${Number(m.converted||0)}</span><span>طلبات مربوطة ${Number(m.attributedOrders||0)}</span><strong>AED ${Number(m.measuredRevenue||0).toFixed(0)}</strong></div><p>${escapeHtml(segment.recommendedAction||'راجع الشريحة وحدد الإجراء المناسب.')}</p><button class="segment-action" type="button" data-segment-action="${escapeHtml(segment.key)}">إنشاء مسودة إجراء</button></article>`;}).join('')||'<div class="empty">لا توجد شرائح بيانات حالياً.</div>';
}
function renderCustomerSegmentMembers(segment){
  const wrap=$('#customer-segment-members'); const body=$('#customer-segment-members-body'); const title=$('#customer-segment-members-title'); if(!wrap||!body||!title)return;
  if(!segment){wrap.hidden=true;return;}
  title.textContent=`${segment.label} — ${segment.count} عميل`;
  body.innerHTML=(segment.members||[]).map(member=>`<tr><td><strong>${escapeHtml(member.name)}</strong><small dir="ltr">${escapeHtml(member.phone)}</small></td><td>${Number(member.orderCount||0)}</td><td class="price">AED ${Number(member.totalRevenue||0).toFixed(0)}</td><td>${member.daysSinceLastOrder===null?'—':member.daysSinceLastOrder+' يوم'}</td><td class="actions"><button class="small-action" type="button" data-customer-360="${escapeHtml(member.id)}">فتح الملف</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا يوجد عملاء داخل هذه الشريحة.</td></tr>';
  wrap.hidden=false;
  wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
}
let customerSegmentsLoaded=false;
async function loadCustomerSegments(force=false){
  if(customerSegmentsLoaded&&!force){renderCustomerSegments();window.__ARABISK_CUSTOMER_SEGMENTS__=customerSegments;window.__ARABISK_CUSTOMER_STATE_READY__=true;window.dispatchEvent(new CustomEvent('arabisk:customer-state-updated'));return;}
  const result=await request('/api/revenue/customer-segments');
  customerSegments=Array.isArray(result.segments)?result.segments:[];
  customerSegmentsLoaded=true;
  window.__ARABISK_CUSTOMER_SEGMENTS__=customerSegments;
  window.__ARABISK_CUSTOMER_STATE_READY__=true;
  window.dispatchEvent(new CustomEvent('arabisk:customer-state-updated'));
  renderCustomerSegments();
}
function renderCustomers(){
  const state=$('#customers-state');
  const body=$('#customers-body');
  const search=$('#customers-search');
  const filter=$('#customers-filter');
  const sort=$('#customers-sort');
  if(!customers.length){if(state)state.textContent='لا توجد بيانات عملاء مسجلة حاليًا.';if(body)body.innerHTML='';return;}
  const query=(search?.value||'').trim().toLowerCase();
  const mode=filter?.value||'';
  const order=sort?.value||'recent';
  let filtered=customers.filter(customer=>{
    if(query&&!`${customer.name||''} ${customer.phone||''}`.toLowerCase().includes(query))return false;
    if(mode==='orders'&&Number(customer.orderCount||0)<=0)return false;
    if(mode==='reservations'&&Number(customer.reservationCount||0)<=0)return false;
    return true;
  });
  filtered=filtered.slice().sort((left,right)=>{
    if(order==='orders')return Number(right.orderCount||0)-Number(left.orderCount||0);
    if(order==='reservations')return Number(right.reservationCount||0)-Number(left.reservationCount||0);
    if(order==='name')return String(left.name||'').localeCompare(String(right.name||''),'ar');
    const leftTime=left.lastOrderAt?Date.parse(left.lastOrderAt):0;
    const rightTime=right.lastOrderAt?Date.parse(right.lastOrderAt):0;
    return rightTime-leftTime;
  });
  if(state)state.textContent=(query||mode)
    ? `عرض ${filtered.length} من ${customers.length} عميل.`
    : `${customers.length} عميل مسجل — مرتب حسب الأحدث طلبًا.`;
  if(body)body.innerHTML=filtered.map(customer=>`<tr><td><strong>${escapeHtml(customer.name||'عميل')}</strong><small dir="ltr">${escapeHtml(customer.phone||'')}</small></td><td>${Number(customer.orderCount||0)}</td><td>${Number(customer.reservationCount||0)}</td><td>${customer.lastOrderAt?new Date(customer.lastOrderAt).toLocaleDateString('ar-AE'):'—'}</td><td class="actions"><button class="small-action" data-customer-360="${escapeHtml(customer.id)}" type="button">فتح الملف</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">لا يوجد عميل يطابق التصفية الحالية.</td></tr>';
}
function openModal(product=null){editingId=product?.id||null;$('#modal-title').textContent=editingId?'تعديل الصنف':'إضافة صنف جديد';$('#name-ar').value=product?.nameAr||'';$('#name-en').value=product?.nameEn||'';$('#price').value=product?.price??'';$('#image-url').value=product?.imageUrl&&!product.imageKey?product.imageUrl:'';$('#description-ar').value=product?.descriptionAr||'';$('#category').innerHTML=categories.map(c=>`<option value="${escapeHtml(c.id)}" ${product?.categoryId===c.id?'selected':''}>${escapeHtml(c.nameAr)}</option>`).join('');$('#available').checked=product?.available??true;$('#video-file').value='';$('#selected-file').textContent='';$('#remove-video').hidden=!product?.videoKey;updateVideoPreview(product?.videoUrl||'');$('#image-file').value='';$('#selected-image').textContent='';$('#remove-image').hidden=!product?.imageKey;updateImagePreview(product?.imageUrl||'');$('#modal').classList.add('show');$('#modal').setAttribute('aria-hidden','false');$('#name-ar').focus();}
function closeModal(){$('#modal').classList.remove('show');$('#modal').setAttribute('aria-hidden','true');editingId=null;}
function updateVideoPreview(url){const wrap=$('#video-preview'),player=$('#video-preview-player');if(!url){wrap.hidden=true;player.removeAttribute('src');player.load();return}player.src=url;wrap.hidden=false;}
function updateImagePreview(url){const wrap=$('#image-preview'),image=$('#image-preview-player');if(!url){wrap.hidden=true;image.removeAttribute('src');return}image.src=url;wrap.hidden=false;}
function syncSidebarState(){
  const collapsed=localStorage.getItem('ARABISK_SIDEBAR_COLLAPSED')==='1';
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  const toggle=$('#sidebar-toggle');
  if(toggle){
    toggle.setAttribute('aria-expanded',String(!collapsed));
    toggle.setAttribute('aria-label',collapsed?'توسيع القائمة':'طي القائمة');
    toggle.title=collapsed?'توسيع القائمة':'طي القائمة';
    toggle.querySelector('span').textContent=collapsed?'›':'‹';
  }
}
function showSection(sectionId){if(sectionId==='customers')void loadCustomerSegments().catch(()=>{});document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('section-visible'));document.querySelectorAll('[data-section]').forEach(link=>link.classList.toggle('active',link.dataset.section===sectionId));const titleMap={dashboard:'إدارة ARABISK',products:'إدارة الأصناف',categories:'إدارة الأقسام',studio:'ARABISK Studio — العروض',experiences:'الفعاليات والتجارب',reservations:'حجوزات الطاولات',orders:'الطلبات',revenue:'فرص الإيراد',memories:'ذكريات',customers:'العملاء',settings:'إعدادات الموقع'};$('#page-title').textContent=titleMap[sectionId]||'إدارة ARABISK';$('#dashboard-stats').style.display=sectionId==='dashboard'?'grid':'none';const section=document.getElementById(sectionId==='dashboard'?'products':sectionId);if(section)section.classList.add('section-visible');if(sectionId==='dashboard')document.getElementById('products').classList.add('section-visible');}
async function load(){ $('#connection').textContent='جارٍ الاتصال…';try{const results=await Promise.all([request('/api/categories'),request('/api/products'),request('/api/orders'),request('/api/customers'),request('/api/reservations')]);[categories,products,orders,customers,reservations]=results;window.__ARABISK_CUSTOMERS__=customers;window.dispatchEvent(new CustomEvent('arabisk:customer-state-updated'));renderStats();renderProducts();renderCategories();renderOrders();renderCustomers();renderReservations();$('#connection').textContent='متصل';$('#connection').className='connected';$('#error').textContent='';}catch(error){$('#connection').textContent='غير متصل';$('#connection').className='disconnected';$('#error').textContent=`${error.message}. تحقق من رابط الـAPI في الإعدادات.`;}}
function loadSettings(){$('#api-base').value=apiBase();$('#site-name').value=localStorage.getItem('ARABISK_SITE_NAME')||'ARABISK';$('#site-description').value=localStorage.getItem('ARABISK_SITE_DESCRIPTION')||'مطعم وكافيه بطابع عربي عصري.';}
async function uploadFile(endpoint,productId,file,onProgress,errorText){const prepared=await request(endpoint,{method:'POST',body:JSON.stringify({productId,fileName:file.name,contentType:file.type,size:file.size})});await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',prepared.uploadUrl);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.upload.onprogress=event=>{if(event.lengthComputable&&onProgress)onProgress(Math.round(event.loaded/event.total*100))};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(errorText));xhr.onerror=()=>reject(new Error('تعذر الاتصال بتخزين الوسائط.'));xhr.send(file)});return prepared.key;}
async function deleteVideo(productId){const prepared=await request('/api/videos/delete-presign',{method:'POST',body:JSON.stringify({productId})});if(prepared.url){const response=await fetch(prepared.url,{method:'DELETE'});if(!response.ok)throw new Error('تعذر حذف الفيديو من التخزين.')}await request(`/api/products/${productId}`,{method:'PATCH',body:JSON.stringify({videoKey:''})});}
async function deleteImage(productId){const prepared=await request('/api/images/delete-presign',{method:'POST',body:JSON.stringify({productId})});if(prepared.url){const response=await fetch(prepared.url,{method:'DELETE'});if(!response.ok)throw new Error('تعذر حذف الصورة من التخزين.')}await request(`/api/products/${productId}`,{method:'PATCH',body:JSON.stringify({imageKey:''})});}
document.querySelectorAll('[data-section]').forEach(link=>link.addEventListener('click',()=>setTimeout(()=>showSection(link.dataset.section),0)));
['customers-search','customers-filter','customers-sort'].forEach(id=>document.querySelector('#'+id)?.addEventListener(id==='customers-search'?'input':'change',renderCustomers));
$('#add-product').addEventListener('click',()=>openModal());$('#cancel').addEventListener('click',closeModal);$('#search').addEventListener('input',renderProducts);$('#refresh-reservations').addEventListener('click',load);$('#refresh-orders').addEventListener('click',load);$('#modal').addEventListener('click',event=>{if(event.target.id==='modal')closeModal()});
$('#video-file').addEventListener('change',()=>{const file=$('#video-file').files[0];if(!file){$('#selected-file').textContent='';return}$('#selected-file').textContent=`${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`;if($('#video-preview-player').src.startsWith('blob:'))URL.revokeObjectURL($('#video-preview-player').src);updateVideoPreview(URL.createObjectURL(file));$('#remove-video').hidden=false});
$('#image-file').addEventListener('change',()=>{const file=$('#image-file').files[0];if(!file){$('#selected-image').textContent='';return}$('#selected-image').textContent=`${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`;updateImagePreview(URL.createObjectURL(file));$('#remove-image').hidden=false});
$('#remove-video').addEventListener('click',async()=>{if(!editingId||!confirm('حذف فيديو التحضير لهذا المنتج؟'))return;try{await deleteVideo(editingId);const p=products.find(x=>x.id===editingId);if(p){p.videoKey='';p.videoUrl=''}$('#video-file').value='';$('#selected-file').textContent='';$('#remove-video').hidden=true;updateVideoPreview('');renderProducts()}catch(error){alert(error.message)}});
$('#remove-image').addEventListener('click',async()=>{if(!editingId||!confirm('حذف صورة هذا المنتج؟'))return;try{await deleteImage(editingId);const p=products.find(x=>x.id===editingId);if(p){p.imageKey='';p.imageUrl=''}$('#image-file').value='';$('#selected-image').textContent='';$('#remove-image').hidden=true;updateImagePreview('');renderProducts()}catch(error){alert(error.message)}});
$('#products-body').addEventListener('click',async(event)=>{const edit=event.target.dataset.edit,del=event.target.dataset.delete,video=event.target.dataset.video;if(edit)return openModal(products.find(p=>p.id===edit));if(video){const product=products.find(p=>p.id===video);if(!product?.videoUrl)return alert('لا يوجد فيديو تحضير مضاف لهذا الصنف.');window.open(product.videoUrl,'_blank','noopener');return}if(del){const product=products.find(p=>p.id===del);if(!product||!confirm(`حذف «${product.nameAr}»؟`))return;try{await request(`/api/products/${del}`,{method:'DELETE'});await load()}catch(error){alert(error.message)}}});
$('#reservations-body').addEventListener('click',async event=>{const id=event.target.dataset.id,status=event.target.dataset.resStatus;if(!id||!status)return;try{await request(`/api/reservations/${id}`,{method:'PATCH',body:JSON.stringify({status})});await load()}catch(error){alert(error.message)}});
$('#orders-body').addEventListener('change',async event=>{const id=event.target.dataset.orderStatus;if(!id)return;try{await request(`/api/orders/${id}`,{method:'PATCH',body:JSON.stringify({status:event.target.value})});await load()}catch(error){alert(error.message);await load()}});
$('#product-form').addEventListener('submit',async event=>{event.preventDefault();const submit=$('#product-form .submit'),progress=$('#upload-progress');submit.disabled=true;try{const payload={categoryId:$('#category').value,nameAr:$('#name-ar').value,nameEn:$('#name-en').value,descriptionAr:$('#description-ar').value,imageUrl:$('#image-url').value.trim(),price:Number($('#price').value),available:$('#available').checked};let saved=editingId?await request(`/api/products/${editingId}`,{method:'PATCH',body:JSON.stringify(payload)}):await request('/api/products',{method:'POST',body:JSON.stringify(payload)});const imageFile=$('#image-file').files[0];if(imageFile){if(imageFile.size>15*1024*1024)throw new Error('الحد الأقصى للصورة 15MB.');if(!['image/jpeg','image/png','image/webp','image/avif'].includes(imageFile.type))throw new Error('الصيغ المسموحة: JPG وPNG وWebP وAVIF.');progress.hidden=false;progress.querySelector('span').style.width='0%';progress.querySelector('small').textContent='جاري رفع الصورة… 0%';const key=await uploadFile('/api/images/presign',saved.id,imageFile,percent=>{progress.querySelector('span').style.width=`${percent}%`;progress.querySelector('small').textContent=`جاري رفع الصورة… ${percent}%`},'فشل رفع الصورة إلى التخزين.');saved=await request(`/api/products/${saved.id}`,{method:'PATCH',body:JSON.stringify({imageKey:key,imageUrl:''})})}const file=$('#video-file').files[0];if(file){if(file.size>120*1024*1024)throw new Error('الحد الأقصى للفيديو 120MB.');if(!['video/mp4','video/webm','video/quicktime'].includes(file.type))throw new Error('الصيغ المسموحة: MP4 وWebM وMOV.');progress.hidden=false;progress.querySelector('span').style.width='0%';progress.querySelector('small').textContent='جاري رفع الفيديو… 0%';const key=await uploadFile('/api/videos/presign',saved.id,file,percent=>{progress.querySelector('span').style.width=`${percent}%`;progress.querySelector('small').textContent=`جاري رفع الفيديو… ${percent}%`},'فشل رفع الفيديو إلى التخزين.');await request(`/api/products/${saved.id}`,{method:'PATCH',body:JSON.stringify({videoKey:key})})}progress.hidden=true;closeModal();await load()}catch(error){progress.hidden=true;alert(error.message)}finally{submit.disabled=false}});
$('#settings-form').addEventListener('submit',event=>{event.preventDefault();localStorage.setItem('ARABISK_API_BASE',$('#api-base').value.trim().replace(/\/$/,''));localStorage.setItem('ARABISK_SITE_NAME',$('#site-name').value.trim());localStorage.setItem('ARABISK_SITE_DESCRIPTION',$('#site-description').value.trim());$('#settings-message').textContent='تم حفظ الإعدادات.';setTimeout(()=>$('#settings-message').textContent='',2500);load()});
syncSidebarState();$('#sidebar-toggle')?.addEventListener('click',()=>{const collapsed=!document.body.classList.contains('sidebar-collapsed');localStorage.setItem('ARABISK_SIDEBAR_COLLAPSED',collapsed?'1':'0');syncSidebarState();});loadSettings();showSection(location.hash.replace('#','')||'dashboard');load();

async function openCustomer360(customerId){
  const modal=$('#customer360-modal');
  const body=$('#customer360-body');
  if(!modal||!body)return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  body.innerHTML='<p class="empty">جارٍ تحميل ملف العميل…</p>';
  try{
    const profile=await request('/api/revenue/customers/'+encodeURIComponent(customerId)+'/360');
    const customer=profile.customer||{};
    const summary=profile.summary||{};
    const behavior=profile.behavior||{};
    const money=value=>'AED '+Number(value||0).toFixed(0);
    const opportunityRows=(profile.opportunities||[]).slice(0,6);
    const opps=opportunityRows.map(item=>{
      const action=item.recommendedAction||item.reason||'فرصة مرتبطة بالعميل';
      const actionButton=customer.marketingOptIn&&item.id
        ? '<button class="small-action" type="button" data-customer-opportunity="'+escapeHtml(item.id)+'" data-opportunity-type="'+escapeHtml(item.type||'')+'">إنشاء إجراء</button>'
        : '';
      return '<div class="customer360-opportunity"><div><strong>'+escapeHtml(item.priority||'فرصة')+'</strong><span>'+escapeHtml(item.reason||'فرصة مرتبطة بالعميل')+'</span><small>'+escapeHtml(action)+'</small></div>'+actionButton+'</div>';
    }).join('')||'<div class="empty">لا توجد فرص مرتبطة حاليًا.</div>';
    const orders=(profile.orders||[]).map(order=>'<tr><td><strong>'+escapeHtml(order.id)+'</strong><small>'+new Date(order.createdAt).toLocaleString('ar-AE')+'</small></td><td class="price">'+money(order.total)+'</td><td>'+escapeHtml(order.status)+'</td></tr>').join('')||'<tr><td colspan="3" class="empty">لا توجد طلبات.</td></tr>';
    const reservations=(profile.reservations||[]).map(item=>'<tr><td>'+escapeHtml(item.date)+'<small>'+escapeHtml(item.time)+'</small></td><td>'+Number(item.guests||0)+'</td><td>'+escapeHtml(item.status)+'</td></tr>').join('')||'<tr><td colspan="3" class="empty">لا توجد حجوزات.</td></tr>';
    const favorites=(behavior.favoriteProducts||[]).map(item=>'<span class="customer360-chip">'+escapeHtml(item.name)+' <b>'+Number(item.quantity||0)+'×</b></span>').join('')||'<span class="customer360-muted">لا توجد مشتريات كافية لتحديد نمط واضح.</span>';
    const lastItems=(behavior.lastOrderItems||[]).map(item=>'<span class="customer360-chip">'+escapeHtml(item.nameAr||item.productId)+' <b>'+Number(item.quantity||0)+'×</b></span>').join('')||'<span class="customer360-muted">لا يوجد طلب سابق متاح.</span>';
    const eventSummary=Object.entries(behavior.eventCounts||{}).slice(0,5).map(([key,count])=>'<span class="customer360-chip">'+escapeHtml(key)+' <b>'+Number(count||0)+'</b></span>').join('')||'<span class="customer360-muted">لا توجد أحداث مرتبطة.</span>';
    const actions=(profile.relatedActions||[]).map(item=>'<tr><td><strong>'+escapeHtml(item.title||item.type)+'</strong><small>'+escapeHtml(item.id||'')+'</small></td><td>'+escapeHtml(item.status)+'</td><td>'+money(item.resultRevenue)+'</td><td>'+escapeHtml(item.orderId||'—')+'</td><td><button class="small-action" type="button" data-campaign-jump="'+escapeHtml(item.id||'')+'">فتح الإجراء</button></td></tr>').join('')||'<tr><td colspan="5" class="empty">لا توجد إجراءات مرتبطة بالعميل.</td></tr>';
    const timelineStatus = value => ({
      draft:'مسودة',
      executed:'تم التنفيذ',
      converted:'تحول إلى طلب',
      ignored:'تجاهل',
      completed:'مكتمل',
      confirmed:'مؤكد',
      pending:'قيد الانتظار',
      cancelled:'ملغى',
      high:'أولوية عالية',
      medium:'أولوية متوسطة',
      low:'أولوية منخفضة'
    }[value] || value || '');
    const timelineTypeClass = value => ({
      order:'order',
      reservation:'reservation',
      action:'action',
      event:'event'
    }[value] || 'event');
    const timeline=(profile.timeline||[]).map(item=>{
      const value=Number(item.value||0);
      const valueHtml=value>0?'<b class="customer360-timeline-value">'+money(value)+'</b>':'';
      const status=timelineStatus(item.status);
      const statusHtml=status?'<span class="customer360-timeline-status">'+escapeHtml(status)+'</span>':'';
      const scheduled=item.scheduledAt?'<small>موعد الزيارة: '+escapeHtml(item.scheduledAt)+'</small>':'';
      const targetSection=item.type==='order'?'orders':item.type==='reservation'?'reservations':'';
      const targetRef=escapeHtml(item.reference||'');
      const actionHtml=targetSection&&item.reference
        ? '<button class="small-action customer360-timeline-jump" type="button" data-timeline-jump="'+targetSection+'" data-timeline-ref="'+targetRef+'">فتح في لوحة '+(item.type==='order'?'الطلبات':'الحجوزات')+'</button>'
        : '';
      return '<article class="customer360-timeline-item '+timelineTypeClass(item.type)+'" data-timeline-type="'+escapeHtml(item.type||'event')+'">'+
        '<div class="customer360-timeline-dot" aria-hidden="true"></div>'+
        '<div class="customer360-timeline-content">'+
          '<div class="customer360-timeline-meta"><span>'+escapeHtml(item.label||'نشاط')+'</span><time>'+escapeHtml(item.at?new Date(item.at).toLocaleString('ar-AE'):'')+'</time></div>'+
          '<strong>'+escapeHtml(item.title||'نشاط العميل')+'</strong>'+
          (item.details?'<p>'+escapeHtml(item.details)+'</p>':'')+
          scheduled+
          '<div class="customer360-timeline-foot">'+statusHtml+valueHtml+actionHtml+'</div>'+
        '</div>'+
      '</article>';
    }).join('')||'<div class="empty">لا يوجد نشاط كافٍ لبناء الخط الزمني.</div>';
    const decision=profile.decision||{};
    const internalNotes=profile.customer?.internalNotes||'';
    const internalNotesUpdatedAt=profile.customer?.internalNotesUpdatedAt||'';
    const notesUpdatedLabel=internalNotesUpdatedAt?'آخر تحديث: '+new Date(internalNotesUpdatedAt).toLocaleString('ar-AE'):'لم تُسجل ملاحظة داخلية بعد';
    const readinessLabels={
      needs_consent:'تحتاج مراجعة موافقة التواصل',
      blocked:'يوجد عائق تشغيلي',
      overdue:'توجد مهمة متأخرة',
      open:'يوجد إجراء مفتوح',
      observe:'لا يوجد إجراء مفتوح'
    };
    const readinessLabel=readinessLabels[decision.stateKey]||(
      decision.consentRequired
        ? 'تحتاج مراجعة موافقة التواصل'
        : decision.blockedActions>0
          ? 'يوجد عائق تشغيلي'
          : decision.overdueActions>0
            ? 'توجد مهمة متأخرة'
            : decision.openActions>0
              ? 'يوجد إجراء مفتوح'
              : 'لا يوجد إجراء مفتوح'
    );
    const decisionAction=decision.nextOpenActionId
      ? '<button type="button" class="small-action customer360-decision-action" data-campaign-jump="'+escapeHtml(decision.nextOpenActionId)+'">فتح الإجراء المفتوح</button>'
      : decision.actionType&&decision.actionReference
        ? '<button type="button" class="small-action customer360-decision-action" data-decision-create data-decision-type="'+escapeHtml(decision.actionType)+'" data-decision-reference="'+escapeHtml(decision.actionReference)+'">إنشاء إجراء</button>'
        : '';
    const decisionPotential=Number(decision.potentialValue||0)>0
      ? '<b class="customer360-decision-value">'+money(decision.potentialValue)+'</b>'
      : '';
    const consentLabel=customer.marketingOptIn?'يمكن تنفيذ الإجراء بعد المراجعة':'الموافقة التسويقية غير موجودة؛ الإجراء يبقى يدويًا بعد التحقق';
    body.innerHTML=
      '<div class="customer360-head"><div><span>Customer 360</span><h2>'+escapeHtml(customer.name||'عميل')+'</h2><small dir="ltr">'+escapeHtml(customer.phone||'')+'</small></div><span class="status '+(customer.marketingOptIn?'on':'pending')+'">'+(customer.marketingOptIn?'موافقة تواصل موجودة':'لا توجد موافقة تسويقية')+'</span></div>'+
      '<div class="customer360-stats"><article><span>الطلبات</span><b>'+Number(customer.orderCount||0)+'</b></article><article><span>قيمة الطلبات</span><b>'+money(summary.totalOrderValue)+'</b></article><article><span>متوسط الطلب</span><b>'+money(summary.averageOrderValue)+'</b></article><article><span>آخر طلب</span><b class="customer360-date">'+(summary.daysSinceLastOrder===null?'—':Number(summary.daysSinceLastOrder)+' يوم')+'</b></article><article><span>متوسط العودة</span><b class="customer360-date">'+(summary.averageReturnDays===null?'—':Number(summary.averageReturnDays)+' يوم')+'</b></article><article><span>آخر طلب بقيمة</span><b>'+money(summary.lastOrderValue)+'</b></article><article><span>الحجوزات</span><b>'+Number(summary.totalReservations||0)+'</b></article><article><span>آخر نشاط</span><b class="customer360-date">'+(summary.lastActivityAt?new Date(summary.lastActivityAt).toLocaleString('ar-AE'):'—')+'</b></article></div>'+
      '<div class="customer360-decision"><div class="customer360-decision-head"><div><span>مركز قرار العميل</span><h3>'+escapeHtml(decision.label||'حالة العميل')+'</h3><p>'+escapeHtml(decision.reason||'لا توجد إشارة تشغيلية إضافية.')+'</p></div><span class="customer360-decision-state '+escapeHtml(decision.stateKey||'')+'">'+escapeHtml(readinessLabel)+'</span></div><div class="customer360-decision-meta"><span>مهام مفتوحة: <b>'+Number(decision.openActions||0)+'</b></span><span>محجوبة: <b>'+Number(decision.blockedActions||0)+'</b></span><span>متأخرة: <b>'+Number(decision.overdueActions||0)+'</b></span>'+decisionPotential+'</div><div class="customer360-decision-foot"><strong>'+escapeHtml(decision.recommendedAction||profile.nextAction||'راجع العميل وحدد الإجراء المناسب.')+'</strong><small>'+escapeHtml(consentLabel)+'</small>'+decisionAction+'</div></div>'+
      '<div class="customer360-behavior"><div><h3>الأصناف الأكثر تكرارًا</h3><div class="customer360-chip-list">'+favorites+'</div></div><div><h3>آخر طلب</h3><div class="customer360-chip-list">'+lastItems+'</div></div><div><h3>نشاط العميل</h3><div class="customer360-chip-list">'+eventSummary+'</div></div></div>'+
      '<div class="customer360-notes"><div class="customer360-notes-head"><div><h3>ملاحظات الفريق الداخلية</h3><p>خاصة باللوحة الإدارية ولا تظهر للعميل.</p></div><span id="customer360-notes-status">'+escapeHtml(notesUpdatedLabel)+'</span></div><textarea id="customer360-internal-notes" maxlength="2000" placeholder="اكتب ملاحظة للفريق عن تفضيلات العميل أو آخر متابعة…">'+escapeHtml(internalNotes)+'</textarea><div class="customer360-notes-foot"><small>الحد الأقصى 2000 حرف.</small><button type="button" class="small-action" id="customer360-notes-save">حفظ الملاحظة</button></div></div>'+
      '<div class="customer360-timeline"><div class="customer360-timeline-head"><div><h3>الخط الزمني للعميل</h3><p>الطلبات والحجوزات والأحداث والإجراءات في مسار زمني واحد.</p></div><span>آخر 60 نشاطًا</span></div><div class="customer360-timeline-filters" role="tablist" aria-label="تصفية الخط الزمني"><button type="button" class="active" data-timeline-filter="all">الكل <b data-timeline-count="all">0</b></button><button type="button" data-timeline-filter="order">الطلبات <b data-timeline-count="order">0</b></button><button type="button" data-timeline-filter="reservation">الحجوزات <b data-timeline-count="reservation">0</b></button><button type="button" data-timeline-filter="event">التفاعل <b data-timeline-count="event">0</b></button><button type="button" data-timeline-filter="action">إجراءات الإيراد <b data-timeline-count="action">0</b></button></div><div class="customer360-timeline-list">'+timeline+'</div></div>'+
      '<div class="customer360-columns"><div><h3>الطلبات</h3><div class="table-wrap"><table><thead><tr><th>الطلب</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>'+orders+'</tbody></table></div></div><div><h3>الحجوزات</h3><div class="table-wrap"><table><thead><tr><th>الموعد</th><th>الأشخاص</th><th>الحالة</th></tr></thead><tbody>'+reservations+'</tbody></table></div></div></div>'+
      '<div class="customer360-opportunities"><h3>الفرص المرتبطة</h3>'+opps+'</div>'+
      '<div class="customer360-actions"><h3>سجل الإجراءات</h3><div class="table-wrap"><table><thead><tr><th>الإجراء</th><th>الحالة</th><th>الإيراد</th><th>الطلب</th><th></th></tr></thead><tbody>'+actions+'</tbody></table></div></div>';
    body.querySelector('#customer360-notes-save')?.addEventListener('click',async()=>{
      const button=body.querySelector('#customer360-notes-save');
      const field=body.querySelector('#customer360-internal-notes');
      const status=body.querySelector('#customer360-notes-status');
      if(!button||!field)return;
      button.disabled=true;
      if(status)status.textContent='جاري الحفظ…';
      try{
        const saved=await request('/api/customers/'+encodeURIComponent(customer.id),{method:'PATCH',body:JSON.stringify({internalNotes:field.value})});
        if(status)status.textContent=saved.internalNotesUpdatedAt?'تم الحفظ — '+new Date(saved.internalNotesUpdatedAt).toLocaleString('ar-AE'):'تم الحفظ';
      }catch(error){
        if(status)status.textContent=error.message||'تعذر حفظ الملاحظة.';
      }finally{button.disabled=false;}
    });
    body.querySelectorAll('[data-campaign-jump]').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.dataset.campaignJump||'';
      showSection('revenue');
      if(window.ARABISK_LOAD_REVENUE)await window.ARABISK_LOAD_REVENUE();
      const row=document.querySelector('[data-campaign-id="'+CSS.escape(id)+'"]');
      if(row){
        row.classList.add('customer360-highlight-row');
        row.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>row.classList.remove('customer360-highlight-row'),2200);
      }
    }));
    body.querySelectorAll('[data-timeline-jump]').forEach(button=>button.addEventListener('click',()=>{
      const section=button.dataset.timelineJump;
      const reference=button.dataset.timelineRef||'';
      showSection(section);
      setTimeout(()=>{
        const row=section==='orders'
          ? document.querySelector('select[data-order-status="'+CSS.escape(reference)+'"]')?.closest('tr')
          : document.querySelector('[data-id="'+CSS.escape(reference)+'"]')?.closest('tr');
        if(row){
          row.classList.add('customer360-highlight-row');
          row.scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(()=>row.classList.remove('customer360-highlight-row'),2200);
        }
      },80);
    }));
    const timelineCounts=profile.timelineCounts||{};
    body.querySelectorAll('[data-timeline-count]').forEach(node=>{node.textContent=Number(timelineCounts[node.dataset.timelineCount]||0)});
    body.querySelectorAll('[data-timeline-filter]').forEach(button=>button.addEventListener('click',()=>{
      const filter=button.dataset.timelineFilter||'all';
      body.querySelectorAll('[data-timeline-filter]').forEach(item=>item.classList.toggle('active',item===button));
      body.querySelectorAll('[data-timeline-type]').forEach(item=>{
        item.hidden=filter!=='all'&&item.dataset.timelineType!==filter;
      });
    }));
    body.querySelectorAll('[data-decision-create]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        const response=await request('/api/revenue/campaign-drafts',{method:'POST',body:JSON.stringify({type:button.dataset.decisionType||'',reference:button.dataset.decisionReference||''})});
        if(!response)throw new Error('تعذر إنشاء الإجراء.');
        button.textContent=response.reused?'الإجراء موجود بالفعل':'تم إنشاء الإجراء';
        const campaignId=response.id||response.campaignId||'';
        if(campaignId){
          showSection('revenue');
          if(window.ARABISK_LOAD_REVENUE)await window.ARABISK_LOAD_REVENUE();
          const row=document.querySelector('[data-campaign-id="'+CSS.escape(campaignId)+'"]');
          if(row){
            row.classList.add('customer360-highlight-row');
            row.scrollIntoView({behavior:'smooth',block:'center'});
            setTimeout(()=>row.classList.remove('customer360-highlight-row'),2200);
          }
        }
      }catch(error){alert(error.message||'تعذر إنشاء الإجراء.')}finally{button.disabled=false;}
    }));
    body.querySelectorAll('[data-customer-opportunity]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        const type=button.dataset.opportunityType||'';
        const reference=button.dataset.customerOpportunity;
        const response=await request('/api/revenue/campaign-drafts',{method:'POST',body:JSON.stringify({type,reference})});
        button.textContent=response.reused?'موجودة بالفعل':'تم إنشاء الإجراء';
        await loadCustomerSegments();
      }catch(error){alert(error.message)}finally{button.disabled=false;}
    }));
  }catch(error){body.innerHTML='<p class="empty">'+escapeHtml(error.message)+'</p>';}
}
function closeCustomer360(){const modal=$('#customer360-modal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');}
document.addEventListener('click',event=>{const segmentButton=event.target.closest('[data-segment-key]');if(segmentButton){const segment=customerSegments.find(item=>item.key===segmentButton.dataset.segmentKey);renderCustomerSegmentMembers(segment);}});
async function createSegmentActionDraft(segmentKey){
  const segment=customerSegments.find(item=>item.key===segmentKey); if(!segment)return;
  try{
    const data=await request('/api/revenue/campaign-drafts',{method:'POST',body:JSON.stringify({type:'segment_action',reference:segment.key})});
    const draft=data;
    const state=$('#customers-state'); if(state)state.textContent=data.reused?`المهمة الخاصة بـ${segment.label} موجودة بالفعل ومفتوحة (${draft.id}) — لم يتم إنشاء نسخة مكررة.`:`تم إنشاء مسودة إجراء لـ${segment.label} (${draft.id}). التنفيذ يدوي وبعد التحقق من الموافقة.`;
  }catch(error){const state=$('#customers-state');if(state)state.textContent=error.message;}
}
document.querySelector('#customer-segments-refresh')?.addEventListener('click',()=>void loadCustomerSegments(true));
document.addEventListener('click',event=>{const actionButton=event.target.closest('[data-segment-action]');if(actionButton){event.stopPropagation();void createSegmentActionDraft(actionButton.dataset.segmentAction);}});
document.querySelector('#customer-segment-close')?.addEventListener('click',()=>{const wrap=$('#customer-segment-members');if(wrap)wrap.hidden=true;});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-customer-360]');
  if(button)void openCustomer360(button.dataset.customer360);
  if(event.target.closest('#customer360-close'))closeCustomer360();
});
