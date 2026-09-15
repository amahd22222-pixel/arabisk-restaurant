const API = 'https://web-production-d41a3.up.railway.app';
const state = { banners: [], editing: null };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
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
  if (!main || q('#banners')) return;
  const nav = q('aside');
  if (nav && !q('a[data-section="banners"]')) {
    const settings = q('a[data-section="settings"]');
    nav.insertBefore(create('a', { href:'#banners', 'data-section':'banners' }, 'البنرات'), settings || nav.querySelector('.user'));
  }
  const section = create('section', { id:'banners', class:'panel admin-section' }, `
    <div class="panelhead"><div><h2>البنرات</h2><span>تحكم كامل في الصورة والنص والرابط والحالة والترتيب لكل بانر</span></div><button id="add-banner" class="small-action" type="button">+ إضافة بانر</button></div>
    <div class="banner-toolbar"><select id="banner-filter"><option value="">كل أماكن العرض</option><option value="home-hero">الرئيسية — البانر الرئيسي</option><option value="home-promo">الرئيسية — ترويجي</option><option value="menu-top">المنيو — أعلى القائمة</option><option value="footer-promo">الفوتر — ترويجي</option><option value="custom">مخصص</option></select><span id="banner-count" class="banner-count">—</span></div>
    <div class="table-wrap"><table><thead><tr><th>المعاينة</th><th>مكان العرض</th><th>العنوان</th><th>الحالة</th><th>الترتيب</th><th></th></tr></thead><tbody id="banners-body"></tbody></table></div>
    <div id="banner-empty" class="empty" hidden>لا توجد بنرات في هذا المكان.</div>
  `);
  const settings = q('#settings');
  main.insertBefore(section, settings || null);
  const modal = create('div', { id:'banner-modal', class:'modal', 'aria-hidden':'true' }, `
    <div class="modal-card banner-modal-card">
      <div class="modal-head"><div><span>ARABISK BANNERS</span><h2 id="banner-modal-title">إضافة بانر</h2></div><button id="banner-close" class="close" type="button">×</button></div>
      <form id="banner-form">
        <div class="banner-grid two"><label>مكان العرض<select id="banner-placement"><option value="home-hero">الرئيسية — البانر الرئيسي</option><option value="home-promo">الرئيسية — ترويجي</option><option value="menu-top">المنيو — أعلى القائمة</option><option value="footer-promo">الفوتر — ترويجي</option><option value="custom">مخصص</option></select></label><label>الترتيب<input id="banner-order" type="number" min="1" step="1" value="1"></label></div>
        <div class="banner-grid two"><label>العنوان بالعربية<input id="banner-title-ar" maxlength="140"></label><label>العنوان بالإنجليزية<input id="banner-title-en" maxlength="160"></label></div>
        <div class="banner-grid two"><label>الوصف بالعربية<textarea id="banner-subtitle-ar" rows="3" maxlength="260"></textarea></label><label>الوصف بالإنجليزية<textarea id="banner-subtitle-en" rows="3" maxlength="300"></textarea></label></div>
        <div class="banner-grid two"><label>زر العربية<input id="banner-button-ar" maxlength="80" placeholder="استكشف المنيو"></label><label>زر الإنجليزية<input id="banner-button-en" maxlength="90" placeholder="Explore Menu"></label></div>
        <label>الرابط<input id="banner-link" type="text" maxlength="1000" placeholder="#menu أو /menu أو https://..."></label>
        <div class="banner-grid two">
          <div class="banner-upload-box"><label>صورة سطح المكتب<input id="banner-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></label><input id="banner-image-url" placeholder="أو ضع رابط الصورة"/><div id="banner-image-preview" class="banner-preview" hidden></div><button id="remove-banner-image" class="ghost-danger" type="button" hidden>حذف صورة سطح المكتب</button></div>
          <div class="banner-upload-box"><label>صورة الهاتف<input id="banner-mobile-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></label><input id="banner-mobile-url" placeholder="أو ضع رابط الصورة"></div>
        </div>
        <label class="check"><input id="banner-active" type="checkbox" checked> البانر فعال</label>
        <div id="banner-upload-progress" class="upload-progress" hidden><span></span><small>جاري رفع صورة البانر…</small></div>
        <button class="submit" type="submit">حفظ البانر</button>
      </form>
    </div>
  `);
  document.body.appendChild(modal);
}

function setVisible(sectionId) {
  document.querySelectorAll('.admin-section').forEach((section) => section.classList.toggle('section-visible', section.id === sectionId));
  document.querySelectorAll('aside a[data-section]').forEach((link) => link.classList.toggle('active', link.dataset.section === sectionId));
  const title = q('#page-title');
  if (title) title.textContent = sectionId === 'banners' ? 'إدارة البنرات' : title.textContent;
}

async function uploadImage(file, bannerId, slot) {
  if (!file) return { key: '', url: '' };
  if (file.size > 15 * 1024 * 1024) throw new Error('الحد الأقصى لصورة البانر 15MB');
  const allowed = ['image/jpeg','image/png','image/webp','image/avif'];
  if (!allowed.includes(file.type)) throw new Error('نوع الصورة غير مدعوم');
  const presign = await api('/api/banners/images/presign', { method:'POST', body: JSON.stringify({ bannerId, slot, fileName:file.name, contentType:file.type, size:file.size }) });
  const upload = await fetch(presign.uploadUrl, { method:'PUT', headers:{'Content-Type':file.type}, body:file });
  if (!upload.ok) throw new Error('فشل رفع الصورة');
  return { key: presign.key };
}

async function removeImage(bannerId, slot) {
  if (!bannerId) return;
  const result = await api('/api/banners/images/delete-presign', { method:'POST', body:JSON.stringify({ bannerId, slot }) });
  if (result.url) await fetch(result.url, { method:'DELETE' });
}

function readForm() {
  return {
    placement:q('#banner-placement').value,
    titleAr:q('#banner-title-ar').value.trim(),
    titleEn:q('#banner-title-en').value.trim(),
    subtitleAr:q('#banner-subtitle-ar').value.trim(),
    subtitleEn:q('#banner-subtitle-en').value.trim(),
    buttonTextAr:q('#banner-button-ar').value.trim(),
    buttonTextEn:q('#banner-button-en').value.trim(),
    link:q('#banner-link').value.trim() || '#menu',
    imageUrl:q('#banner-image-url').value.trim(),
    mobileImageUrl:q('#banner-mobile-url').value.trim(),
    active:q('#banner-active').checked,
    sortOrder:Number(q('#banner-order').value) || 1
  };
}

function fillForm(banner) {
  q('#banner-modal-title').textContent = banner ? `تعديل ${banner.id}` : 'إضافة بانر';
  q('#banner-placement').value = banner?.placement || 'home-hero';
  q('#banner-title-ar').value = banner?.titleAr || '';
  q('#banner-title-en').value = banner?.titleEn || '';
  q('#banner-subtitle-ar').value = banner?.subtitleAr || '';
  q('#banner-subtitle-en').value = banner?.subtitleEn || '';
  q('#banner-button-ar').value = banner?.buttonTextAr || '';
  q('#banner-button-en').value = banner?.buttonTextEn || '';
  q('#banner-link').value = banner?.link || '#menu';
  q('#banner-image-url').value = banner?.imageUrl || '';
  q('#banner-mobile-url').value = banner?.mobileImageUrl || '';
  q('#banner-order').value = banner?.sortOrder || 1;
  q('#banner-active').checked = banner?.active !== false;
  q('#banner-image-file').value = '';
  q('#banner-mobile-file').value = '';
  const preview = q('#banner-image-preview');
  if (banner?.imageUrl) { preview.hidden = false; preview.style.backgroundImage = `url(${JSON.stringify(banner.imageUrl)})`; preview.innerHTML = `<span>صورة سطح المكتب</span>`; q('#remove-banner-image').hidden = false; } else { preview.hidden = true; preview.style.backgroundImage = ''; preview.innerHTML=''; q('#remove-banner-image').hidden = true; }
}

function openModal(banner = null) { state.editing = banner; fillForm(banner); q('#banner-modal').classList.add('show'); q('#banner-modal').setAttribute('aria-hidden','false'); }
function closeModal() { state.editing = null; q('#banner-modal').classList.remove('show'); q('#banner-modal').setAttribute('aria-hidden','true'); }

function rowHtml(banner) {
  const image = banner.imageUrl || banner.mobileImageUrl;
  return `<tr><td><div class="banner-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<span>AR</span>'}</div></td><td><span class="banner-placement">${escapeHtml(placementLabels[banner.placement] || banner.placement)}</span></td><td><strong>${escapeHtml(banner.titleAr || banner.titleEn || '—')}</strong><small>${escapeHtml(banner.titleEn || '')}</small></td><td><button class="status ${banner.active ? 'on' : 'off'}" data-banner-toggle="${banner.id}">${banner.active ? 'فعال' : 'متوقف'}</button></td><td><input class="banner-order-inline" data-banner-order="${banner.id}" type="number" min="1" value="${Number(banner.sortOrder || 1)}"></td><td class="actions"><button type="button" data-banner-edit="${banner.id}">تعديل</button><button type="button" class="danger" data-banner-delete="${banner.id}">حذف</button></td></tr>`;
}

function render() {
  const filter = q('#banner-filter').value;
  const items = state.banners.filter((banner) => !filter || banner.placement === filter).slice().sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0));
  q('#banners-body').innerHTML = items.map(rowHtml).join('');
  q('#banner-empty').hidden = items.length > 0;
  q('#banner-count').textContent = `${items.length} بانر`;
  items.forEach((banner) => {
    q(`[data-banner-toggle="${banner.id}"]`)?.addEventListener('click', async () => { await api(`/api/banners/${banner.id}`, { method:'PATCH', body:JSON.stringify({ active:!banner.active }) }); await load(); });
    q(`[data-banner-edit="${banner.id}"]`)?.addEventListener('click', () => openModal(banner));
    q(`[data-banner-delete="${banner.id}"]`)?.addEventListener('click', async () => { if (!confirm(`حذف البانر ${banner.id}؟`)) return; await api(`/api/banners/${banner.id}`, { method:'DELETE' }); await load(); });
    q(`[data-banner-order="${banner.id}"]`)?.addEventListener('change', async (event) => { const value = Math.max(1, Number(event.target.value)||1); await api(`/api/banners/${banner.id}`, { method:'PATCH', body:JSON.stringify({ sortOrder:value }) }); await load(); });
  });
}

async function load() {
  state.banners = await api('/api/banners');
  render();
}

async function handleSubmit(event) {
  event.preventDefault();
  const progress = q('#banner-upload-progress');
  try {
    progress.hidden = false;
    const span = progress.querySelector('span');
    span.style.width = '10%';
    const form = readForm();
    const current = state.editing;
    if (current) {
      const desktopFile = q('#banner-image-file').files[0];
      const mobileFile = q('#banner-mobile-file').files[0];
      if (desktopFile) { const upload = await uploadImage(desktopFile, current.id, 'desktop'); form.imageKey = upload.key; span.style.width = '45%'; }
      if (mobileFile) { const upload = await uploadImage(mobileFile, current.id, 'mobile'); form.mobileImageKey = upload.key; span.style.width = '70%'; }
      await api(`/api/banners/${current.id}`, { method:'PATCH', body:JSON.stringify(form) });
    } else {
      const created = await api('/api/banners', { method:'POST', body:JSON.stringify(form) });
      const desktopFile = q('#banner-image-file').files[0];
      const mobileFile = q('#banner-mobile-file').files[0];
      const patch = {};
      if (desktopFile) { const upload = await uploadImage(desktopFile, created.id, 'desktop'); patch.imageKey = upload.key; span.style.width = '45%'; }
      if (mobileFile) { const upload = await uploadImage(mobileFile, created.id, 'mobile'); patch.mobileImageKey = upload.key; span.style.width = '70%'; }
      if (Object.keys(patch).length) await api(`/api/banners/${created.id}`, { method:'PATCH', body:JSON.stringify(patch) });
    }
    span.style.width = '100%';
    closeModal();
    await load();
  } catch (error) {
    alert(error.message || 'تعذر حفظ البانر');
  } finally {
    setTimeout(() => { progress.hidden = true; progress.querySelector('span').style.width='0%'; }, 350);
  }
}

function bind() {
  ensureSection();
  q('#add-banner')?.addEventListener('click', () => openModal());
  q('#banner-filter')?.addEventListener('change', render);
  q('#banner-close')?.addEventListener('click', closeModal);
  q('#banner-form')?.addEventListener('submit', handleSubmit);
  q('#remove-banner-image')?.addEventListener('click', async () => {
    if (!state.editing?.id) return;
    try { await removeImage(state.editing.id, 'desktop'); await api(`/api/banners/${state.editing.id}`, { method:'PATCH', body:JSON.stringify({ imageKey:'', imageUrl:'' }) }); fillForm({ ...state.editing, imageKey:'', imageUrl:'' }); await load(); }
    catch (error) { alert(error.message || 'تعذر حذف الصورة'); }
  });
  window.addEventListener('hashchange', () => { const hash = window.location.hash.slice(1); if (hash === 'banners') setVisible('banners'); });
  if (window.location.hash === '#banners') setVisible('banners');
}

document.addEventListener('DOMContentLoaded', async () => {
  bind();
  try { await load(); } catch (error) { const target = q('#error'); if (target) target.textContent = error.message; }
});
