const categoryView = document.querySelector('#category-view');
const categoryDetail = document.querySelector('#category-detail');
const categoryBanner = document.querySelector('#category-banner');
const grid = document.querySelector('#grid');
const searchInput = document.querySelector('#menu-search');
const backButton = document.querySelector('#back-to-categories');
const detailTitle = document.querySelector('#detail-title');
const detailEyebrow = document.querySelector('#detail-eyebrow');
const detailLead = document.querySelector('#detail-lead');
const menuSection = document.querySelector('#menu');
const homeSection = document.querySelector('#home');
const reservationSection = document.querySelector('#reservation');
const aboutSection = document.querySelector('#about');
const API = '/api/products';
const CATEGORY_API = '/api/categories';
const categoryImageOverrides = {
  Breakfast:'https://images.unsplash.com/photo-1570882716056-9b4919acaf51?auto=format&fit=crop&w=1800&q=85',
  Manakish:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1800&q=85',
  'Cold Appetizers':'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=1800&q=85',
  'Hot Appetizers':'https://images.unsplash.com/photo-1623653387945-2fd25214f8fc?auto=format&fit=crop&w=1800&q=85',
  Salads:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1800&q=85',
  Soups:'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1800&q=85',
  Sandwich:'https://images.unsplash.com/photo-1521305916504-4a1121188589?auto=format&fit=crop&w=1800&q=85',
  Pizza:'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1800&q=85',
  Pasta:'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1800&q=85',
  'Main Course':'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1800&q=85',
  'Mixed Grill':'https://images.unsplash.com/photo-1633857471930-bfa8d0be5e4a?auto=format&fit=crop&w=1800&q=85',
  'Mixed Taste':'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1800&q=85',
  Desserts:'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1800&q=85',
  'Cheese Cake':'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1800&q=85',
  'Arabisk Ice Cream':'https://images.unsplash.com/photo-1497032205916-ac775f0649ae?auto=format&fit=crop&w=1800&q=85',
  'Cocktail & Refreshing Drinks':'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1800&q=85',
  'Energy Drinks':'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=1800&q=85',
  Juices:'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=1800&q=85',
  Mojitos:'https://images.unsplash.com/photo-1568926825354-c277ddca9bec?auto=format&fit=crop&w=1800&q=85',
  'Milk Shakes':'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1800&q=85',
  Tea:'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1800&q=85',
  Coffee:'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1800&q=85',
  Latte:'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=1800&q=85',
  'Soft Drinks':'https://images.unsplash.com/photo-1543253687-c4b3b9c1aa8d?auto=format&fit=crop&w=1800&q=85',
  'Drinking Water':'https://images.unsplash.com/photo-1560023907-5f339617ea30?auto=format&fit=crop&w=1800&q=85',
  Sheesha:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1800&q=85'
};
const translations={
  ar:{home:'الرئيسية',menu:'المنيو',reservationNav:'حجز طاولة',about:'عن المطعم',contact:'تواصل معنا',eyebrow:'RESTAURANT & CAFE',hero1:'مذاق عربي',hero2:'بروح عصرية',lead:'تجربة ضيافة عربية تجمع بين الأطباق الأصيلة والأجواء الراقية.',explore:'استكشف المنيو',bookTable:'احجز طاولتك',heroCard:'Authentic<br/>Arabic Taste',ourMenu:'OUR MENU',menuTitle:'قائمة الطعام',menuLead:'اختر قسمًا لاستكشاف أصنافه في صفحة مستقلة',backToCategories:'← كل الأقسام',searchLabel:'بحث',searchPlaceholder:'ابحث داخل القسم…',experience:'THE ARABISK EXPERIENCE',aboutTitle:'أكثر من مجرد وجبة',aboutLead:'هوية عربية دافئة، تفاصيل فاخرة، وأطباق صُممت لتُشارك وتُستمتع بها.',copyright:'© 2026 ARABISK. All rights reserved.',reservationEyebrow:'TABLE RESERVATION',reservationTitle:'احجز طاولتك',reservationLead:'اختر التاريخ والوقت وعدد الأشخاص وسنتواصل معك لتأكيد الحجز.',nameLabel:'الاسم',phoneLabel:'رقم الهاتف',dateLabel:'التاريخ',timeLabel:'الوقت',guestsLabel:'عدد الأشخاص',notesLabel:'ملاحظات',notesPlaceholder:'مثلاً: طاولة داخلية، مناسبة خاصة…',confirmBooking:'إرسال طلب الحجز',bookingSuccess:'تم استلام طلب الحجز بنجاح. سنتواصل معك لتأكيد الموعد.',bookingError:'تعذر إرسال طلب الحجز حاليًا. حاول مرة أخرى.',prepEyebrow:'PREPARATION VIDEO',watchVideo:'شاهد طريقة التحضير',videoUnavailable:'فيديو التحضير غير متوفر لهذا الصنف.',noItems:'لا توجد أصناف في هذا القسم حالياً.'},
  en:{home:'Home',menu:'Menu',reservationNav:'Book a Table',about:'About Us',contact:'Contact',eyebrow:'RESTAURANT & CAFE',hero1:'Authentic Arabic',hero2:'with a Modern Spirit',lead:'An Arabic hospitality experience blending authentic dishes with an elegant atmosphere.',explore:'Explore the Menu',bookTable:'Book a Table',heroCard:'Authentic<br/>Arabic Taste',ourMenu:'OUR MENU',menuTitle:'Our Menu',menuLead:'Choose a category to explore its dishes on a dedicated page',backToCategories:'← All Categories',searchLabel:'Search',searchPlaceholder:'Search this category…',experience:'THE ARABISK EXPERIENCE',aboutTitle:'More Than a Meal',aboutLead:'A warm Arabic identity, refined details, and dishes designed to be shared and enjoyed.',copyright:'© 2026 ARABISK. All rights reserved.',reservationEyebrow:'TABLE RESERVATION',reservationTitle:'Book a Table',reservationLead:'Choose your date, time and party size and we will contact you to confirm.',nameLabel:'Name',phoneLabel:'Phone',dateLabel:'Date',timeLabel:'Time',guestsLabel:'Guests',notesLabel:'Notes',notesPlaceholder:'For example: indoor table, special occasion…',confirmBooking:'Send Reservation Request',bookingSuccess:'Your reservation request was received. We will contact you to confirm.',bookingError:'Unable to submit the reservation right now. Please try again.',prepEyebrow:'PREPARATION VIDEO',watchVideo:'Watch Preparation',videoUnavailable:'No preparation video is available for this item.',noItems:'No items are available in this category yet.'}
};
let language=localStorage.getItem('ARABISK_LANG')||'ar';
let categories=[];
let currentCategory=null;
let currentItems=[];
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const slugify=(value)=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const categoryFromPath=()=>{const match=window.location.pathname.match(/^\/menu\/([^/]+)\/?$/);return match?decodeURIComponent(match[1]):null};
const categorySlug=(category)=>slugify(category.id);

async function loadCategories(){const r=await fetch(CATEGORY_API);if(!r.ok)throw new Error('Unable to load categories');return r.json();}
async function loadProducts(categoryId=''){const r=await fetch(categoryId?`${API}?category=${encodeURIComponent(categoryId)}`:API);if(!r.ok)throw new Error('Unable to load menu');return r.json();}
function applyLanguage(){const strings=translations[language];document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.querySelectorAll('[data-i18n]').forEach(n=>{const v=strings[n.dataset.i18n];if(v!==undefined)n.innerHTML=v});document.querySelectorAll('[data-i18n-placeholder]').forEach(n=>{const v=strings[n.dataset.i18nPlaceholder];if(v!==undefined)n.placeholder=v});document.querySelector('#lang-toggle').textContent=language==='ar'?'EN':'ع';document.querySelector('#lang-toggle').setAttribute('aria-label',language==='ar'?'Switch to English':'التبديل إلى العربية');renderCategories();if(currentCategory){renderCategoryPage(currentCategory,currentItems)} }
function renderCategories(){const isEn=language==='en';categoryView.innerHTML=categories.filter(c=>c.active!==false).map(c=>{const img=categoryImageOverrides[c.id]||c.imageUrl||'';return `<a class="category-card" href="/menu/${categorySlug(c)}" data-category="${escapeHtml(c.id)}"><div class="category-image"><img src="${escapeHtml(img)}" alt="${escapeHtml(isEn?c.nameEn:c.nameAr)}" loading="lazy"><span class="category-shade"></span></div><div class="category-copy"><span class="cat-en">${escapeHtml(c.nameEn)}</span><h3>${escapeHtml(isEn?c.nameEn:c.nameAr)}</h3><span class="category-arrow">${isEn?'Explore →':'اكتشف القسم ←'}</span></div></a>`}).join('')}
function renderCategoryItems(items){const isEn=language==='en';const q=searchInput.value.trim().toLowerCase();const filtered=q?items.filter(i=>`${i.nameAr} ${i.nameEn}`.toLowerCase().includes(q)):items;grid.innerHTML=filtered.map(item=>`<article class="item"><span class="cat">${escapeHtml(item.nameEn)}</span><div><h3>${escapeHtml(isEn?item.nameEn:item.nameAr)}</h3><p>${escapeHtml(isEn?(item.descriptionEn||'A signature ARABISK selection.'):(item.descriptionAr||'اختيار من قائمة ARABISK المميزة'))}</p></div><div class="item-bottom"><div class="price">AED ${Number(item.price).toFixed(0)}</div>${item.videoUrl?`<button class="video-trigger" type="button" data-video="${escapeHtml(item.videoUrl)}" data-title="${escapeHtml(isEn?item.nameEn:item.nameAr)}">▶ ${escapeHtml(translations[language].watchVideo)}</button>`:''}</div></article>`).join('')||`<p class="empty-menu">${translations[language].noItems}</p>`}
function renderCategoryPage(category,items){const isEn=language==='en';currentCategory=category;detailTitle.textContent=isEn?category.nameEn:category.nameAr;detailEyebrow.textContent=category.nameEn.toUpperCase();detailLead.textContent=isEn?`Explore our ${category.nameEn} selection.`:`استكشف تشكيلة ${category.nameAr}.`;categoryBanner.style.backgroundImage=`url("${categoryImageOverrides[category.id]||category.imageUrl||''}")`;renderCategoryItems(items)}
function setRouteMode(isCategoryPage){document.body.classList.toggle('category-route',isCategoryPage);homeSection.hidden=isCategoryPage;reservationSection.hidden=isCategoryPage;aboutSection.hidden=isCategoryPage;categoryView.hidden=isCategoryPage;categoryDetail.hidden=!isCategoryPage;if(!isCategoryPage){menuSection.scrollIntoView({behavior:'smooth',block:'start'})}}
async function openCategoryPage(categoryId,{push=true}={}){const category=categories.find(c=>c.id===categoryId);if(!category)return;currentCategory=category;setRouteMode(true);searchInput.value='';grid.innerHTML='<div class="menu-loading"></div><div class="menu-loading"></div><div class="menu-loading"></div>';if(push){const target=`/menu/${categorySlug(category)}`;if(window.location.pathname!==target)history.pushState({category:category.id},'',target)}document.title=`${language==='en'?category.nameEn:category.nameAr} — ARABISK`;try{currentItems=await loadProducts(category.id);renderCategoryPage(category,currentItems)}catch(error){console.error(error);grid.innerHTML=`<p class="empty-menu">${language==='en'?'Unable to load this category.':'تعذر تحميل هذا القسم حاليًا.'}</p>`}window.scrollTo({top:0,behavior:'smooth'})}
function goHome(push=true){if(push)history.pushState({},'',window.location.pathname.startsWith('/menu/')?' /'.trim():'/');currentCategory=null;currentItems=[];searchInput.value='';setRouteMode(false);document.title='ARABISK — Restaurant & Cafe';}
function initRoute(){const slug=categoryFromPath();if(slug){const found=categories.find(c=>categorySlug(c)===slug);if(found)openCategoryPage(found.id,{push:false});else goHome(false)}else setRouteMode(false)}
backButton.addEventListener('click',()=>goHome(true));
searchInput.addEventListener('input',()=>renderCategoryItems(currentItems));
window.addEventListener('popstate',()=>initRoute());
categoryView.addEventListener('click',event=>{const card=event.target.closest('[data-category]');if(card){event.preventDefault();openCategoryPage(card.dataset.category)}});
document.querySelector('#lang-toggle').addEventListener('click',()=>{language=language==='ar'?'en':'ar';localStorage.setItem('ARABISK_LANG',language);applyLanguage();if(currentCategory){const target=`/menu/${categorySlug(currentCategory)}`;history.replaceState({},'',target);document.title=`${language==='en'?currentCategory.nameEn:currentCategory.nameAr} — ARABISK`}});
const videoModal=document.querySelector('#video-modal');const productVideo=document.querySelector('#product-video');const videoTitle=document.querySelector('#video-title');const videoFallback=document.querySelector('#video-fallback');
function openVideo(url,title){videoTitle.textContent=title;productVideo.src=url;productVideo.hidden=false;videoFallback.hidden=true;videoModal.classList.add('show');videoModal.setAttribute('aria-hidden','false');productVideo.play().catch(()=>{})}
function closeVideo(){productVideo.pause();productVideo.removeAttribute('src');productVideo.load();videoModal.classList.remove('show');videoModal.setAttribute('aria-hidden','true')}
grid.addEventListener('click',event=>{const b=event.target.closest('.video-trigger');if(b)openVideo(b.dataset.video,b.dataset.title)});document.querySelector('#video-close').addEventListener('click',closeVideo);videoModal.addEventListener('click',event=>{if(event.target===videoModal)closeVideo()});productVideo.addEventListener('error',()=>{productVideo.hidden=true;videoFallback.hidden=false});
const reservationForm=document.querySelector('#reservation-form');const reservationMessage=document.querySelector('#reservation-message');const reservationDate=document.querySelector('#reservation-date');const today=new Date();const localToday=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);reservationDate.min=localToday;
reservationForm.addEventListener('submit',async event=>{event.preventDefault();reservationMessage.textContent='';const submit=reservationForm.querySelector('button[type="submit"]');submit.disabled=true;try{const r=await fetch('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.querySelector('#reservation-name').value,phone:document.querySelector('#reservation-phone').value,date:reservationDate.value,time:document.querySelector('#reservation-time').value,guests:Number(document.querySelector('#reservation-guests').value),notes:document.querySelector('#reservation-notes').value})});if(!r.ok)throw new Error('Reservation failed');reservationMessage.textContent=translations[language].bookingSuccess;reservationForm.reset();reservationDate.min=localToday}catch(error){console.error(error);reservationMessage.textContent=translations[language].bookingError}finally{submit.disabled=false}});
(async function boot(){try{categories=await loadCategories();applyLanguage();initRoute()}catch(error){console.error(error);categoryView.innerHTML=`<p class="empty-menu">تعذر تحميل الأقسام حاليًا.</p>`}})();