const API = 'https://web-production-d41a3.up.railway.app';
const state = { shows: [], editing: null, media: null };
const q = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

async function api(path, options = {}) {
  const r = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || 'تعذر تنفيذ العملية');
  return data;
}

function ensureStudioUi() {
  const main = q('main');
  if (!main || q('#studio')) return;
  const section = document.createElement('section');
  section.id = 'studio';
  section.className = 'panel admin-section';
  section.innerHTML = `
    <div class="panelhead"><div><h2>ARABISK Studio — العروض</h2><span>إدارة العروض المرئية فقط. لا يوجد أي نص أو زر فوق الفيديو في الموقع.</span></div><button id="studio-add" class="small-action" type="button">+ إضافة عرض</button></div>
    <div class="banner-toolbar"><span id="studio-count" class="banner-count">—</span></div>
    <div class="table-wrap"><table><thead><tr><th>المعاينة</th><th>اسم داخلي</th><th>سطح المكتب</th><th>الموبايل</th><th>الحالة</th><th>الترتيب</th><th></th></tr></thead><tbody id="studio-body"></tbody></table></div>
    <div id="studio-empty" class="empty" hidden>لا توجد عروض مضافة إلى Studio.</div>`;
  main.insertBefore(section, q('#settings') || null);

  const modal = document.createElement('div');
  modal.id = 'studio-modal';
  modal.className = 'modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-card banner-modal-card">
      <div class="modal-head"><div><span>ARABISK STUDIO</span><h2 id="studio-modal-title">إضافة عرض</h2></div><button id="studio-close" class="close" type="button">×</button></div>
      <form id="studio-form">
        <label>اسم داخلي للعرض<input id="studio-title" maxlength="120" placeholder="مثال: عرض رمضان"></label>
        <div class="banner-grid two">
          <label>فيديو سطح المكتب<input id="studio-desktop" type="file" accept="video/mp4,video/webm,video/quicktime"><small>MP4 / WebM / MOV — حد أقصى 120MB.</small></label>
          <label>فيديو الموبايل<input id="studio-mobile" type="file" accept="video/mp4,video/webm,video/quicktime"><small>يمكن تركه فارغًا لاستخدام فيديو سطح المكتب.</small></label>
        </div>
        <div id="studio-existing" class="selected-file"></div>
        <label>الترتيب<input id="studio-order" type="number" min="1" step="1" value="1"></label>
        <label class="check"><input id="studio-active" type="checkbox" checked> العرض فعال</label>
        <div id="studio-progress" class="upload-progress" hidden><span></span><small>جاري رفع العرض…</small></div>
        <button class="submit" type="submit">حفظ العرض</button>
      </form>
    </div>`;
  document.body.appendChild(modal);

  q('#studio-add').addEventListener('click', () => openEditor());
  q('#studio-close').addEventListener('click', closeEditor);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });
  q('#studio-form').addEventListener('submit', saveEditor);
}

async function getShow(id) { return api(`/api/studio/shows/${encodeURIComponent(id)}`); }

async function upload(file, id, slot) {
  if (!file) return null;
  if (file.size > 120 * 1024 * 1024) throw new Error('الحد الأقصى لفيديو العرض 120MB');
  if (!['video/mp4','video/webm','video/quicktime'].includes(file.type)) throw new Error('الصيغ المسموحة: MP4 وWebM وMOV');
  const p = await api(`/api/studio/shows/${encodeURIComponent(id)}/media/presign`, { method:'POST', body: JSON.stringify({ slot, fileName:file.name, contentType:file.type, size:file.size }) });
  const put = await fetch(p.uploadUrl, { method:'PUT', headers:{'Content-Type':file.type}, body:file });
  if (!put.ok) throw new Error('فشل رفع الفيديو إلى التخزين');
  return p.key;
}

async function deleteOld(id, slot) {
  const p = await api(`/api/studio/shows/${encodeURIComponent(id)}/media/delete-presign`, { method:'POST', body: JSON.stringify({ slot }) });
  if (!p.url) return;
  const r = await fetch(p.url, { method:'DELETE' });
  if (!r.ok) throw new Error('تعذر حذف الفيديو القديم من التخزين');
}

function openEditor(show = null) {
  state.editing = show;
  state.media = show;
  q('#studio-modal-title').textContent = show ? `تعديل ${show.id}` : 'إضافة عرض';
  q('#studio-title').value = show?.title || '';
  q('#studio-order').value = show?.sortOrder || (state.shows.length + 1);
  q('#studio-active').checked = show?.active !== false;
  q('#studio-desktop').value = '';
  q('#studio-mobile').value = '';
  q('#studio-existing').textContent = show ? `سطح المكتب: ${show.desktopVideoUrl ? 'موجود' : 'غير مضاف'} — الموبايل: ${show.mobileVideoUrl ? 'موجود' : 'غير مضاف'}` : 'لا توجد وسائط محفوظة حاليًا.';
  q('#studio-modal').classList.add('show');
  q('#studio-modal').setAttribute('aria-hidden','false');
}

function closeEditor() {
  q('#studio-modal').classList.remove('show');
  q('#studio-modal').setAttribute('aria-hidden','true');
  state.editing = null;
  state.media = null;
}

async function saveEditor(e) {
  e.preventDefault();
  const progress = q('#studio-progress');
  const bar = progress.querySelector('span');
  progress.hidden = false;
  try {
    const current = state.editing;
    const title = q('#studio-title').value.trim();
    const active = q('#studio-active').checked;
    const sortOrder = Math.max(1, Number(q('#studio-order').value) || 1);
    let id = current?.id;
    if (!id) {
      const created = await api('/api/studio/shows', { method:'POST', body:JSON.stringify({ title, active, sortOrder }) });
      id = created.id;
    } else {
      await api(`/api/studio/shows/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ title, active, sortOrder }) });
    }
    const desktop = q('#studio-desktop').files[0];
    const mobile = q('#studio-mobile').files[0];
    const patch = { active, title, sortOrder };
    if (desktop) { patch.desktopVideoKey = await upload(desktop, id, 'desktop'); bar.style.width='45%'; }
    if (mobile) { patch.mobileVideoKey = await upload(mobile, id, 'mobile'); bar.style.width='65%'; }
    if (desktop && current?.desktopVideoKey) await deleteOld(id, 'desktop');
    if (mobile && current?.mobileVideoKey) await deleteOld(id, 'mobile');
    await api(`/api/studio/shows/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify(patch) });
    bar.style.width='100%';
    closeEditor();
    await load();
  } catch (error) {
    alert(error.message || 'تعذر حفظ العرض');
  } finally {
    setTimeout(() => { progress.hidden=true; bar.style.width='0%'; }, 300);
  }
}

function render() {
  const rows = state.shows.slice().sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0));
  q('#studio-body').innerHTML = rows.map((s) => `<tr><td><div class="banner-thumb">${s.desktopVideoUrl || s.mobileVideoUrl ? `<video muted playsinline preload="metadata" src="${esc(s.desktopVideoUrl || s.mobileVideoUrl)}"></video>` : '<span>STUDIO</span>'}</div></td><td><strong>${esc(s.title || s.id)}</strong></td><td><span class="status ${s.desktopVideoUrl?'on':'off'}">${s.desktopVideoUrl?'موجود':'غير مضاف'}</span></td><td><span class="status ${s.mobileVideoUrl?'on':'off'}">${s.mobileVideoUrl?'موجود':'سطح المكتب'}</span></td><td><button class="status ${s.active?'on':'off'}" data-studio-toggle="${s.id}" type="button">${s.active?'فعال':'متوقف'}</button></td><td><input class="banner-order-inline" data-studio-order="${s.id}" type="number" min="1" value="${Number(s.sortOrder||1)}"></td><td class="actions"><button type="button" data-studio-edit="${s.id}">تعديل</button><button type="button" class="danger" data-studio-delete="${s.id}">حذف</button></td></tr>`).join('');
  q('#studio-empty').hidden = rows.length > 0;
  q('#studio-count').textContent = `${rows.length} عرض`;
  rows.forEach((s) => {
    q(`[data-studio-toggle="${s.id}"]`)?.addEventListener('click', async () => { await api(`/api/studio/shows/${encodeURIComponent(s.id)}`, { method:'PATCH', body:JSON.stringify({ active:!s.active }) }); await load(); });
    q(`[data-studio-edit="${s.id}"]`)?.addEventListener('click', async () => openEditor(await getShow(s.id)));
    q(`[data-studio-delete="${s.id}"]`)?.addEventListener('click', async () => { if (!confirm(`حذف العرض ${s.title || s.id}؟`)) return; await api(`/api/studio/shows/${encodeURIComponent(s.id)}`, { method:'DELETE' }); await load(); });
    q(`[data-studio-order="${s.id}"]`)?.addEventListener('change', async (e) => { await api(`/api/studio/shows/${encodeURIComponent(s.id)}`, { method:'PATCH', body:JSON.stringify({ sortOrder:Math.max(1, Number(e.target.value)||1) }) }); await load(); });
  });
}

async function load() {
  try { state.shows = await api('/api/studio/shows'); render(); } catch (error) { q('#studio-body').innerHTML = `<tr><td colspan="7" class="empty">تعذر تحميل Studio: ${esc(error.message)}</td></tr>`; }
}

document.addEventListener('DOMContentLoaded', () => { ensureStudioUi(); load(); });
