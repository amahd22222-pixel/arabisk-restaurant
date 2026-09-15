const API = 'https://web-production-d41a3.up.railway.app';
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
let activeBannerId = '';

const qs = (s, r = document) => r.querySelector(s);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','\"':'&quot;'}[c]));

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'تعذر تنفيذ العملية');
  return data;
}

async function getVideo(id) {
  return api(`/api/banners/${encodeURIComponent(id)}/video`);
}

function ensureStyles() {
  if (document.getElementById('banner-video-manager-style')) return;
  const style = document.createElement('style');
  style.id = 'banner-video-manager-style';
  style.textContent = `
    .banner-video-cell{white-space:nowrap}.banner-video-btn{border:0;background:#f2ede4;color:#70552b;border:1px solid #e3d7c4;border-radius:9px;padding:7px 10px;font:600 10px Cairo;cursor:pointer}.banner-video-btn.has-video{background:#e8f5ec;color:#2f7e53;border-color:#cfe7d6}.banner-video-modal-card{width:min(640px,100%)}.banner-video-current{background:#111;border-radius:12px;overflow:hidden;margin:8px 0 14px;padding:8px}.banner-video-current video{width:100%;max-height:330px;display:block;border-radius:8px}.banner-video-note{font-size:10px;color:#817b70;margin-top:5px;line-height:1.8}.banner-video-delete{border:0;background:#f8eaea;color:#a23e3e;border-radius:9px;padding:9px 12px;font:600 11px Cairo;cursor:pointer}
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  if (qs('#banner-video-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'banner-video-modal';
  modal.className = 'modal';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML = `
    <div class="modal-card banner-video-modal-card">
      <div class="modal-head"><div><span>ARABISK BANNER VIDEO</span><h2>فيديو البانر</h2></div><button id="banner-video-close" class="close" type="button">×</button></div>
      <div id="banner-video-current" class="banner-video-current" hidden><video id="banner-video-player" controls playsinline preload="metadata"></video></div>
      <label>رفع فيديو للبانر<input id="banner-video-file" type="file" accept="video/mp4,video/webm,video/quicktime"></label>
      <div class="banner-video-note">MP4 أو WebM أو MOV — الحد الأقصى 120MB. الفيديو سيعمل تلقائيًا بصوت مكتوم في البانر عند عرضه على الموقع.</div>
      <label class="check"><input id="banner-video-active" type="checkbox" checked> الفيديو فعال</label>
      <div id="banner-video-progress" class="upload-progress" hidden><span></span><small>جاري رفع الفيديو…</small></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button id="banner-video-save" class="submit" type="button">حفظ الفيديو</button><button id="banner-video-delete" class="banner-video-delete" type="button" hidden>حذف الفيديو</button></div>
    </div>`;
  document.body.appendChild(modal);
  qs('#banner-video-close').addEventListener('click', closeVideoModal);
  qs('#banner-video-modal').addEventListener('click', (e) => { if (e.target.id === 'banner-video-modal') closeVideoModal(); });
  qs('#banner-video-save').addEventListener('click', saveVideo);
  qs('#banner-video-delete').addEventListener('click', deleteVideo);
}

async function openVideoModal(id) {
  activeBannerId = id;
  ensureStyles();
  ensureModal();
  const current = qs('#banner-video-current');
  const player = qs('#banner-video-player');
  const file = qs('#banner-video-file');
  const active = qs('#banner-video-active');
  const del = qs('#banner-video-delete');
  file.value = '';
  const data = await getVideo(id);
  active.checked = data.active !== false;
  if (data.videoUrl) { current.hidden = false; player.src = data.videoUrl; del.hidden = false; }
  else { current.hidden = true; player.removeAttribute('src'); player.load(); del.hidden = true; }
  const modal = qs('#banner-video-modal');
  modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
}

function closeVideoModal() {
  const modal = qs('#banner-video-modal');
  if (!modal) return;
  const player = qs('#banner-video-player');
  player.pause(); player.removeAttribute('src'); player.load();
  modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
  activeBannerId = '';
}

async function saveVideo() {
  if (!activeBannerId) return;
  const file = qs('#banner-video-file').files[0];
  const active = qs('#banner-video-active').checked;
  const progress = qs('#banner-video-progress');
  try {
    progress.hidden = false;
    const bar = progress.querySelector('span');
    if (file) {
      if (file.size > MAX_VIDEO_BYTES) throw new Error('الحد الأقصى للفيديو 120MB');
      if (!['video/mp4','video/webm','video/quicktime'].includes(file.type)) throw new Error('نوع الفيديو غير مدعوم');
      const prepared = await api(`/api/banners/${encodeURIComponent(activeBannerId)}/video/presign`, { method:'POST', body:JSON.stringify({ fileName:file.name, contentType:file.type, size:file.size }) });
      bar.style.width = '35%';
      const upload = await fetch(prepared.uploadUrl, { method:'PUT', headers:{'Content-Type':file.type}, body:file });
      if (!upload.ok) throw new Error('فشل رفع فيديو البانر');
      bar.style.width = '75%';
      await api(`/api/banners/${encodeURIComponent(activeBannerId)}/video`, { method:'PATCH', body:JSON.stringify({ videoKey:prepared.key, active }) });
    } else {
      await api(`/api/banners/${encodeURIComponent(activeBannerId)}/video`, { method:'PATCH', body:JSON.stringify({ active }) });
    }
    bar.style.width = '100%';
    closeVideoModal();
    refreshBannerVideoButtons();
  } catch (error) {
    alert(error.message || 'تعذر حفظ الفيديو');
  } finally {
    setTimeout(() => { if (progress) { progress.hidden = true; progress.querySelector('span').style.width='0%'; } }, 300);
  }
}

async function deleteVideo() {
  if (!activeBannerId) return;
  if (!confirm('حذف فيديو هذا البانر؟')) return;
  try {
    const prepared = await api(`/api/banners/${encodeURIComponent(activeBannerId)}/video/delete-presign`, { method:'POST' });
    if (prepared.url) await fetch(prepared.url, { method:'DELETE' });
    await api(`/api/banners/${encodeURIComponent(activeBannerId)}/video`, { method:'PATCH', body:JSON.stringify({ videoKey:'', active:false }) });
    closeVideoModal();
    refreshBannerVideoButtons();
  } catch (error) { alert(error.message || 'تعذر حذف الفيديو'); }
}

async function refreshBannerVideoButtons() {
  const rows = document.querySelectorAll('#banners-body tr');
  for (const row of rows) {
    const edit = row.querySelector('[data-banner-edit]');
    if (!edit) continue;
    const id = edit.dataset.bannerEdit;
    let cell = row.querySelector('[data-banner-video-cell]');
    if (!cell) { cell = document.createElement('td'); cell.className='banner-video-cell'; cell.dataset.bannerVideoCell='1'; row.appendChild(cell); }
    const data = await getVideo(id).catch(() => ({ videoUrl:'' }));
    cell.innerHTML = `<button type="button" class="banner-video-btn ${data.videoUrl ? 'has-video' : ''}" data-banner-video="${escapeHtml(id)}">${data.videoUrl ? '▶ تعديل الفيديو' : '+ إضافة فيديو'}</button>`;
    cell.querySelector('button').addEventListener('click', () => openVideoModal(id));
  }
  const header = document.querySelector('#banners thead tr');
  if (header && !header.querySelector('[data-banner-video-head]')) { const th = document.createElement('th'); th.dataset.bannerVideoHead='1'; th.textContent='الفيديو'; header.appendChild(th); }
}

function watchBannerRows() {
  ensureStyles();
  const observer = new MutationObserver(() => refreshBannerVideoButtons());
  const target = document.querySelector('#banners-body');
  if (target) { observer.observe(target, { childList:true, subtree:false }); refreshBannerVideoButtons(); }
}

function init() {
  const start = () => {
    if (!document.querySelector('#banners')) return setTimeout(start, 250);
    watchBannerRows();
  };
  start();
}

document.addEventListener('DOMContentLoaded', init);
