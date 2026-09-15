const API = 'https://web-production-d41a3.up.railway.app';
const state = { banners: [], editing: null, mediaType: 'image', video: null };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const placementLabels = { 'home-hero':'الرئيسية — البانر الرئيسي','home-promo':'الرئيسية — ترويجي','menu-top':'المنيو — أعلى القائمة','footer-promo':'الفوتر — ترويجي','custom':'مخصص' };
const q = (selector, root = document) => root.querySelector(selector);
const create = (tag, attrs = {}, html = '') => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v)); el.innerHTML = html; return el; };

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'تعذر تنفيذ العملية');
  return data;
}

function ensureSection() {
  const main = document.querySelector('main');
  if (!main) return;
  if (!q('a[data-section="banners"]')) {
    const nav = q('aside');
    if (nav) {
      const settings = q('a[data-section="settings"]');
      nav.insertBefore(create('a', { href:'#banners', 'data-section':'banners' }, 'البنرات'), settings || nav.querySelector('.user'));
    }
  }
  if (!q('#banners')) {
    const section = create('section', { id:'banners', class:'panel admin-section' }, `
      <div class="panelhead"><div><h2>البنرات</h2><span>إضافة أو تعديل البانر كصورة أو فيديو — تختار النوع من نفس نافذة الإضافة والتعديل</span></div><button id="add-banner" class="small-action" type="button">+ إضافة بانر</button></div>
      <div class="banner-toolbar"><select id="banner-filter"><option value="">كل أماكن العرض</option><option value="home-hero">الرئيسية — البانر الرئيسي</option><option value="home-promo">الرئيسية — ترويجي</option><option value="menu-top">المنيو — أعلى القائمة</option><option value="footer-promo">الفوتر — ترويجي</option><option value="custom">مخصص</option></select><span id="banner-count" class="banner-count">—</span></div>
      <div class="table-wrap"><table><thead><tr><th>المعاينة</th><th>النوع</th><th>مكان العرض</th><th>العنوان</th><th>الحالة</th><th>الترتيب</th><th></th></tr></thead><tbody id="banners-body"></tbody></table></div>
      <div id="banner-empty" class="empty" hidden>لا توجد بنرات في هذا المكان.</div>
    `);
    const settings = q('#settings');
    main.insertBefore(section, settings || null);
  }
  if (!q('#banner-modal')) {
    const modal = create('div', { id:'banner-modal', class:'modal', 'aria-hidden':'true' }, `
      <div class="modal-card banner-modal-card">
        <div class="modal-head"><div><span>ARABISK BANNERS</span><h2 id="banner-modal-title">إضافة بانر</h2></div><button id="banner-close" class="close" type="button">×</button></div>
        <form id="banner-form">
          <div class="banner-grid two">
            <label>مكان العرض<select id="banner-placement"><option value="home-hero">الرئيسية — البانر الرئيسي</option><option value="home-promo">الرئيسية — ترويجي</option><option value="menu-top">المنيو — أعلى القائمة</option><option value="footer-promo">الفوتر — ترويجي</option><option value="custom">مخصص</option></select></label>
            <label>الترتيب<input id="banner-order" type="number" min="1" step="1" value="1"></label>
          </div>
          <div class="banner-grid two"><label>العنوان بالعربية<input id="banner-title-ar" maxlength="140"></label><label>العنوان بالإنجليزية<input id="banner-title-en" maxlength="160"></label></div>
          <div class="banner-grid two"><label>الوصف بالعربية<textarea id="banner-subtitle-ar" rows="3" maxlength="260"></textarea></label><label>الوصف بالإنجليزية<textarea id="banner-subtitle-en" rows="3" maxlength="300"></textarea></label></div>
          <div class="banner-grid two"><label>زر العربية<input id="banner-button-ar" maxlength="80" placeholder="استكشف المنيو"></label><label>زر الإنجليزية<input id="banner-button-en" maxlength="90" placeholder="Explore Menu"></label></div>
          <label>الرابط<input id="banner-link" type="text" maxlength="1000" placeholder="#menu أو /menu أو https://..."></label>
          <label>نوع الوسائط
            <select id="banner-media-type">
              <option value="image">صورة</option>
              <option value="video">فيديو</option>
            </select>
            <small>اختر واحدًا فقط: صورة أو فيديو.</small>
          </label>
          <div id="banner-image-fields">
            <div class="banner-grid two">
              <div class="banner-upload-box"><label>صورة سطح المكتب<input id="banner-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></label><input id="banner-image-url" placeholder="أو ضع رابط الصورة"/><div id="banner-image-preview" class="banner-preview" hidden></div><button id="remove-banner-image" class="ghost-danger" type="button" hidden>حذف صورة سطح المكتب</button></div>
              <div class="banner-upload-box"><label>صورة الهاتف<input id="banner-mobile-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></label><input id="banner-mobile-url" placeholder="أو ضع رابط الصورة"></div>
            </div>
          </div>
          <div id="banner-video-fields" hidden>
            <div class="banner-upload-box"><label>فيديو البانر<input id="banner-video-file" type="file" accept="video/mp4,video/webm,video/quicktime"></label><small>MP4 أو WebM أو MOV — الحد الأقصى 120MB.</small><div id="banner-video-preview" class="banner-video-preview" hidden><video id="banner-video-player" controls muted playsinline preload="metadata"></video></div><button id="remove-banner-video" class="ghost-danger" type="button" hidden>حذف فيديو البانر</button></div>
          </div>
          <label class="check"><input id="banner-active" type="checkbox" checked> البانر فعال</label>
          <div id="banner-upload-progress" class="upload-progress" hidden><span></span><small>جاري حفظ الوسائط…</small></div>
          <button class="submit" type="submit">حفظ البانر</button>
        </form>
      </div>
    `);
    document.body.appendChild(modal);
  }
}

function setVisible(sectionId) {
  document.querySelectorAll('.admin-section').forEach((section) => section.classList.toggle('section-visible', section.id === sectionId));
  document.querySelectorAll('aside a[data-section]').forEach((link) => link.classList.toggle('active', link.dataset.section === sectionId));
  if (sectionId === 'banners' && q('#page-title')) q('#page-title').textContent = 'إدارة البنرات';
}

function syncMediaFields() {
  const type = q('#banner-media-type').value;
  state.mediaType = type;
  q('#banner-image-fields').hidden = type !== 'image';
  q('#banner-video-fields').hidden = type !== 'video';
}

async function uploadImage(file, bannerId, slot) {
  if (!file) return null;
  if (file.size > 15 * 1024 * 1024) throw new Error('الحد الأقصى لصورة البانر 15MB');
  if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('نوع الصورة غير مدعوم');
  const result = await api('/api/banners/images/presign', { method:'POST', body:JSON.stringify({ bannerId, slot, fileName:file.name, contentType:file.type, size:file.size }) });
  const upload = await fetch(result.uploadUrl, { method:'PUT', headers:{'Content-Type':file.type}, body:file });
  if (!upload.ok) throw new Error('فشل رفع الصورة');
  return result.key;
}

async function deleteBannerImages(bannerId, current) {
  if (!bannerId) return;
  for (const slot of ['desktop','mobile']) {
    const key = slot === 'desktop' ? current?.imageKey : current?.mobileImageKey;
    if (!key) continue;
    const result = await api('/api/banners/images/delete-presign', { method:'POST', body:JSON.stringify({ bannerId, slot }) });
    if (result.url) await fetch(result.url, { method:'DELETE' });
  }
  await api(`/api/banners/${bannerId}`, { method:'PATCH', body:JSON.stringify({ imageKey:'', imageUrl:'', mobileImageKey:'', mobileImageUrl:'' }) });
}

async function uploadVideo(file, bannerId) {
  if (!file) return null;
  if (file.size > 120 * 1024 * 1024) throw new Error('الحد الأقصى لفيديو البانر 120MB');
  if (!['video/mp4','video/webm','video/quicktime'].includes(file.type)) throw new Error('نوع الفيديو غير مدعوم');
  const result = await api(`/api/banners/${encodeURIComponent(bannerId)}/video/presign`, { method:'POST', body:JSON.stringify({ fileName:file.name, contentType:file.type, size:file.size }) });
  const upload = await fetch(result.uploadUrl, { method:'PUT', headers:{'Content-Type':file.type}, body:file });
  if (!upload.ok) throw new Error('فشل رفع الفيديو');
  return result.key;
}

async function removeBannerVideo(bannerId) {
  const info = await api(`/api/banners/${encodeURIComponent(bannerId)}/video`);
  if (!info.videoUrl) return;
  await api(`/api/banners/${encodeURIComponent(bannerId)}/video`, { method:'PATCH', body:JSON.stringify({ videoKey:'', active:false }) });
}

async function getBannerVideo(bannerId) {
  try { return await api(`/api/banners/${encodeURIComponent(bannerId)}/video`); } catch { return { active:false, videoUrl:'' }; }
}

function fillImagePreview(url) {
  const preview = q('#banner-image-preview');
  if (url) { preview.hidden = false; preview.style.backgroundImage = `url(${JSON.stringify(url)})`; preview.innerHTML = '<span>صورة البانر</span>'; q('#remove-banner-image').hidden = false; }
  else { preview.hidden = true; preview.style.backgroundImage = ''; preview.innerHTML=''; q('#remove-banner-image').hidden = true; }
}

function fillVideoPreview(url) {
  const preview = q('#banner-video-preview');
  const player = q('#banner-video-player');
  if (url) { preview.hidden = false; player.src = url; q('#remove-banner-video').hidden = false; }
  else { preview.hidden = true; player.removeAttribute('src'); player.load(); q('#remove-banner-video').hidden = true; }
}

function fillForm(banner, video) {
  q('#banner-modal-title').textContent = banner ? `تعديل ${banner.id}` : 'إضافة بانر';
  q('#banner-placement').value = banner?.placement || 'home-hero';
  q('#banner-title-ar').value = banner?.titleAr || '';
  q('#banner-title-en').value = banner?.titleEn || '';
  q('#banner-subtitle-ar').value = banner?.subtitleAr || '';
  q('#banner-subtitle-en').value = banner?.subtitleEn || '';
  q('#banner-button-ar').value = banner?.buttonTextAr || '';
  q('#banner-button-en').value = banner?.buttonTextEn || '';
  q('#banner-link').value = banner?.link || '#menu';
  q('#banner-order').value = banner?.sortOrder || 1;
  q('#banner-active').checked = banner?.active !== false;
  q('#banner-image-file').value = '';
  q('#banner-mobile-file').value = '';
  q('#banner-video-file').value = '';
  fillImagePreview(banner?.imageUrl || banner?.mobileImageUrl || '');
  fillVideoPreview(video?.videoUrl || '');
  q('#banner-media-type').value = video?.videoUrl ? 'video' : 'image';
  syncMediaFields();
  q('#banner-image-url').value = banner?.imageUrl || '';
  q('#banner-mobile-url').value = banner?.mobileImageUrl || '';
}

async function openModal(banner = null) {
  state.editing = banner;
  const video = banner ? await getBannerVideo(banner.id) : null;
  state.video = video;
  fillForm(banner, video);
  q('#banner-modal').classList.add('show');
  q('#banner-modal').setAttribute('aria-hidden','false');
}

function closeModal() {
  state.editing = null;
  state.video = null;
  q('#banner-modal').classList.remove('show');
  q('#banner-modal').setAttribute('aria-hidden','true');
}

function rowHtml(banner, videoMap) {
  const video = videoMap.get(banner.id);
  const isVideo = Boolean(video?.videoUrl);
  const preview = isVideo ? `<span class="banner-media-badge">▶ فيديو</span>` : (banner.imageUrl || banner.mobileImageUrl ? `<img src="${escapeHtml(banner.imageUrl || banner.mobileImageUrl)}" alt="">` : '<span>AR</span>');
  return `<tr><td><div class="banner-thumb">${preview}</div></td><td>${isVideo ? 'فيديو' : 'صورة'}</td><td><span class="banner-placement">${escapeHtml(placementLabels[banner.placement] || banner.placement)}</span></td><td><strong>${escapeHtml(banner.titleAr || banner.titleEn || '—')}</strong><small>${escapeHtml(banner.titleEn || '')}</small></td><td><button class="status ${banner.active ? 'on' : 'off'}" data-banner-toggle="${banner.id}">${banner.active ? 'فعال' : 'متوقف'}</button></td><td><input class="banner-order-inline" data-banner-order="${banner.id}" type="number" min="1" value="${Number(banner.sortOrder || 1)}"></td><td class="actions"><button type="button" data-banner-edit="${banner.id}">تعديل</button><button type="button" class="danger" data-banner-delete="${banner.id}">حذف</button></td></tr>`;
}

async function load() {
  state.banners = await api('/api/banners');
  const videos = await Promise.all(state.banners.map(async (banner) => [banner.id, await getBannerVideo(banner.id)]));
  state.videos = new Map(videos);
  render();
}

function render() {
  const filter = q('#banner-filter').value;
  const items = state.banners.filter((banner) => !filter || banner.placement === filter).slice().sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0));
  q('#banners-body').innerHTML = items.map((banner) => rowHtml(banner, state.videos || new Map())).join('');
  q('#banner-empty').hidden = items.length > 0;
  q('#banner-count').textContent = `${items.length} بانر`;
  items.forEach((banner) => {
    q(`[data-banner-toggle="${banner.id}"]`)?.addEventListener('click', async () => { await api(`/api/banners/${banner.id}`, { method:'PATCH', body:JSON.stringify({ active:!banner.active }) }); await load(); });
    q(`[data-banner-edit="${banner.id}"]`)?.addEventListener('click', () => openModal(banner));
    q(`[data-banner-delete="${banner.id}"]`)?.addEventListener('click', async () => { if (!confirm(`حذف البانر ${banner.id}؟`)) return; await api(`/api/banners/${banner.id}`, { method:'DELETE' }); await load(); });
    q(`[data-banner-order="${banner.id}"]`)?.addEventListener('change', async (event) => { const value = Math.max(1, Number(event.target.value)||1); await api(`/api/banners/${banner.id}`, { method:'PATCH', body:JSON.stringify({ sortOrder:value }) }); await load(); });
  });
}

function readForm() {
  return {
    placement:q('#banner-placement').value,
    titleAr:q('#banner-title-ar').value.trim(), titleEn:q('#banner-title-en').value.trim(),
    subtitleAr:q('#banner-subtitle-ar').value.trim(), subtitleEn:q('#banner-subtitle-en').value.trim(),
    buttonTextAr:q('#banner-button-ar').value.trim(), buttonTextEn:q('#banner-button-en').value.trim(),
    link:q('#banner-link').value.trim() || '#menu',
    imageUrl:q('#banner-image-url').value.trim(), mobileImageUrl:q('#banner-mobile-url').value.trim(),
    active:q('#banner-active').checked, sortOrder:Number(q('#banner-order').value) || 1
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  const progress = q('#banner-upload-progress');
  const span = progress.querySelector('span');
  try {
    progress.hidden = false; span.style.width = '10%';
    const type = q('#banner-media-type').value;
    const form = readForm();
    const current = state.editing;
    let banner = current;
    if (!current) banner = await api('/api/banners', { method:'POST', body:JSON.stringify(form) });
    else await api(`/api/banners/${current.id}`, { method:'PATCH', body:JSON.stringify(form) });
    if (type === 'image') {
      if (current) await removeBannerVideo(banner.id);
      const desktopFile = q('#banner-image-file').files[0];
      const mobileFile = q('#banner-mobile-file').files[0];
      const patch = { imageUrl:form.imageUrl, mobileImageUrl:form.mobileImageUrl };
      if (desktopFile) patch.imageKey = await uploadImage(desktopFile, banner.id, 'desktop');
      if (mobileFile) patch.mobileImageKey = await uploadImage(mobileFile, banner.id, 'mobile');
      span.style.width = '75%';
      await api(`/api/banners/${banner.id}`, { method:'PATCH', body:JSON.stringify(patch) });
    } else {
      await deleteBannerImages(banner.id, state.editing || {});
      const file = q('#banner-video-file').files[0];
      if (file) {
        const key = await uploadVideo(file, banner.id);
        await api(`/api/banners/${banner.id}/video`, { method:'PATCH', body:JSON.stringify({ videoKey:key, active:form.active }) });
      } else if (!state.video?.videoUrl) {
        throw new Error('اختر فيديو للبانر قبل الحفظ');
      } else {
        await api(`/api/banners/${banner.id}/video`, { method:'PATCH', body:JSON.stringify({ active:form.active }) });
      }
      span.style.width = '75%';
    }
    if (type === 'image' && current && state.mediaType === 'video') await removeBannerVideo(banner.id);
    span.style.width = '100%';
    closeModal();
    await load();
  } catch (error) {
    alert(error.message || 'تعذر حفظ البانر');
  } finally {
    setTimeout(() => { progress.hidden = true; span.style.width='0%'; }, 350);
  }
}

function bind() {
  ensureSection();
  q('#add-banner')?.addEventListener('click', () => openModal());
  q('#banner-close')?.addEventListener('click', closeModal);
  q('#banner-media-type')?.addEventListener('change', syncMediaFields);
  q('#banner-filter')?.addEventListener('change', render);
  q('#banner-form')?.addEventListener('submit', handleSubmit);
  q('#banner-image-file')?.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) fillImagePreview(URL.createObjectURL(file)); });
  q('#banner-video-file')?.addEventListener('change', (event) => { const file = event.target.files[0]; if (file) fillVideoPreview(URL.createObjectURL(file)); });
  q('#remove-banner-image')?.addEventListener('click', async () => { if (state.editing) await deleteBannerImages(state.editing.id, state.editing); q('#banner-image-url').value=''; q('#banner-mobile-url').value=''; q('#banner-image-file').value=''; fillImagePreview(''); });
  q('#remove-banner-video')?.addEventListener('click', async () => { if (state.editing) await removeBannerVideo(state.editing.id); q('#banner-video-file').value=''; state.video=null; fillVideoPreview(''); });
  document.addEventListener('click', (event) => { const link = event.target.closest('aside a[data-section]'); if (link) { const section = link.dataset.section; if (section === 'banners') { event.preventDefault(); setVisible('banners'); history.replaceState(null,'','#banners'); } } });
  load().catch((error) => console.error('Banner manager:', error));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
