const formatDate=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'موعد سيُعلن قريبًا';return new Intl.DateTimeFormat('ar-AE',{weekday:'long',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};
const typeLabel=value=>({event:'فعالية',music:'موسيقى',chef:'تجربة الشيف',family:'عائلية',private:'خاصة',seasonal:'موسمية'}[value]||value||'تجربة');
const qs=s=>document.querySelector(s);
(async()=>{try{
const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
const r=await fetch('/api/experiences/'+encodeURIComponent(slug),{cache:'no-store'});if(!r.ok)throw new Error();
const item=await r.json();
const title=item.titleAr||item.titleEn||'الفعالية';
document.title=title+' — ARABISK';
qs('#event-eyebrow').textContent=item.eyebrow||'ARABISK EXPERIENCES';
qs('#event-title').textContent=title;
qs('#event-title-en').textContent=item.titleEn||'';
qs('#event-type').textContent=typeLabel(item.type);
qs('#event-type-detail').textContent=typeLabel(item.type);
qs('#event-location-badge').textContent=item.location||'ARABISK';
qs('#event-location').textContent=item.location||'ARABISK';
qs('#event-location-quick').textContent=item.location||'ARABISK';
qs('#event-description').textContent=item.descriptionAr||item.descriptionEn||'تجربة خاصة في ARABISK.';
const formattedDate=formatDate(item.startsAt);
qs('#event-date').textContent=formattedDate;
qs('#event-date-quick').textContent=formattedDate;
const capacity=item.capacity?item.capacity+' مقعدًا':'حسب الحجز';
qs('#event-capacity').textContent=capacity;
qs('#event-capacity-quick').textContent=capacity;
qs('#event-price').textContent=Number(item.price)>0?'AED '+Number(item.price).toFixed(0):'دخول مجاني';
const visual=qs('#event-visual'),image=qs('#event-image'),video=qs('#event-video');
if(item.videoUrl){video.src=item.videoUrl;video.hidden=false;image.hidden=true;visual.hidden=false}
else if(item.coverImageUrl){image.src=item.coverImageUrl;image.alt=title;image.hidden=false;video.hidden=true;visual.hidden=false}
else{image.hidden=true;video.hidden=true;visual.hidden=true}
const endTime=Date.parse(item.endsAt||item.startsAt||'');
const bookable=item.bookingEnabled&&item.status==='published'&&(!Number.isFinite(endTime)||endTime>Date.now());
const cta=qs('#event-cta'),note=qs('#event-closed-note'),pill=qs('#event-status-pill'),pillText=qs('#event-status-text');
if(bookable){cta.href='/reservation?event='+encodeURIComponent(item.slug);note.hidden=true;pill.classList.remove('closed');pillText.textContent='الحجز مفتوح'}
else{cta.hidden=true;pill.classList.add('closed');pillText.textContent='الحجز غير متاح حاليًا';note.hidden=false;note.textContent=item.status==='published'?'انتهى وقت الحجز لهذه التجربة.':'الحجز غير متاح لهذه الفعالية حاليًا.'}
qs('#event-share').addEventListener('click',async()=>{try{if(navigator.share){await navigator.share({title, text:'اكتشف '+title+' في ARABISK', url:location.href});return}await navigator.clipboard.writeText(location.href);const b=qs('#event-share');const old=b.textContent;b.textContent='✓ تم نسخ الرابط';setTimeout(()=>b.textContent=old,1800)}catch(_){}});
qs('#event-content').hidden=false;qs('#event-status').hidden=true;
}catch(error){qs('#event-status').textContent='تعذر تحميل هذه الفعالية.';qs('#event-content').hidden=true}})();