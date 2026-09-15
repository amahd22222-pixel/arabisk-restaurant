const categoryManager = (() => {
  const $ = (selector) => document.querySelector(selector);
  const api = (path, options = {}) => fetch(`${(localStorage.getItem('ARABISK_API_BASE') || 'https://web-production-d41a3.up.railway.app').replace(/\/$/, '')}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'حدث خطأ أثناء الاتصال بالخادم');
    return data;
  });
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
  let categories = [];
  let products = [];
  let editingId = null;

  function modalHtml() {
    if (document.getElementById('category-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="category-modal" class="modal" aria-hidden="true">
        <div class="modal-card category-modal-card">
          <div class="modal-head"><div><span>ARABISK CATEGORIES</span><h2 id="category-modal-title">إضافة قسم</h2></div><button id="category-cancel" class="close" type="button">×</button></div>
          <form id="category-form">
            <label>اسم القسم بالعربية<input id="category-name-ar" required maxlength="100"></label>
            <label>اسم القسم بالإنجليزية<input id="category-name-en" required maxlength="120"></label>
            <label>رابط صورة القسم<input id="category-image-url" type="url" placeholder="https://..."></label>
            <label>صورة القسم<input id="category-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><small>JPG أو PNG أو WebP أو AVIF — الحد الأقصى 15MB.</small><div id="category-image-selected" class="selected-file"></div><div id="category-image-preview" class="video-preview" hidden><img id="category-image-preview-img" alt="معاينة صورة القسم" loading="lazy"></div><button id="category-remove-image" class="ghost-danger" type="button" hidden>حذف صورة القسم</button></label>
            <label class="check"><input id="category-active" type="checkbox" checked> القسم نشط</label>
            <div id="category-upload-progress" class="upload-progress" hidden><span></span><small>جاري رفع الصورة…</small></div>
            <button class="submit" type="submit">حفظ القسم</button>
          </form>
        </div>
      </div>`);
  }

  function openModal(category = null) {
    modalHtml();
    editingId = category?.id || null;
    $('#category-modal-title').textContent = editingId ? 'تعديل القسم' : 'إضافة قسم';
    $('#category-name-ar').value = category?.nameAr || '';
    $('#category-name-en').value = category?.nameEn || '';
    $('#category-image-url').value = category?.imageUrl && !category.imageKey ? category.imageUrl : '';
    $('#category-image-file').value = '';
    $('#category-image-selected').textContent = '';
    $('#category-active').checked = category?.active ?? true;
    $('#category-remove-image').hidden = !category?.imageKey;
    setPreview(category?.imageUrl || '');
    $('#category-modal').classList.add('show');
    $('#category-modal').setAttribute('aria-hidden','false');
    $('#category-name-ar').focus();
  }

  function closeModal() {
    const modal = $('#category-modal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    editingId = null;
  }

  function setPreview(url) {
    const wrap = $('#category-image-preview');
    const img = $('#category-image-preview-img');
    if (!url) { wrap.hidden = true; img.removeAttribute('src'); return; }
    img.src = url; wrap.hidden = false;
  }

  async function uploadImage(categoryId, file, onProgress) {
    const prepared = await api('/api/categories/images/presign', { method:'POST', body:JSON.stringify({ categoryId, fileName:file.name, contentType:file.type, size:file.size }) });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', prepared.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => { if (event.lengthComputable && onProgress) onProgress(Math.round(event.loaded / event.total * 100)); };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('فشل رفع صورة القسم.'));
      xhr.onerror = () => reject(new Error('تعذر الاتصال بتخزين الصورة.'));
      xhr.send(file);
    });
    return prepared.key;
  }

  async function deleteImage(categoryId) {
    const prepared = await api('/api/categories/images/delete-presign', { method:'POST', body:JSON.stringify({ categoryId }) });
    if (prepared.url) {
      const response = await fetch(prepared.url, { method:'DELETE' });
      if (!response.ok) throw new Error('تعذر حذف صورة القسم من التخزين.');
    }
    await api(`/api/categories/${categoryId}`, { method:'PATCH', body:JSON.stringify({ imageKey:'', imageUrl:'' }) });
  }

  function render() {
    const tbody = $('#categories-body');
    if (!tbody) return;
    const countProducts = (id) => products.filter((product) => product.categoryId === id).length;
    tbody.innerHTML = categories.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map((category, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${category.imageUrl ? `<img class="category-thumb" src="${escapeHtml(category.imageUrl)}" alt="" loading="lazy">` : '<span class="category-thumb placeholder">—</span>'}</td>
        <td><strong>${escapeHtml(category.nameAr)}</strong><small>${countProducts(category.id)} صنف</small></td>
        <td>${escapeHtml(category.nameEn)}</td>
        <td><button class="status ${category.active === false ? 'off':'on'} category-toggle" data-id="${escapeHtml(category.id)}">${category.active === false ? 'مخفي':'نشط'}</button></td>
        <td class="actions"><button data-category-edit="${escapeHtml(category.id)}">تعديل</button><button data-category-delete="${escapeHtml(category.id)}" class="danger">حذف</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد أقسام.</td></tr>';
  }

  async function load() {
    [categories, products] = await Promise.all([api('/api/categories'), api('/api/products')]);
    render();
  }

  function install() {
    modalHtml();
    const sectionHeader = $('#categories .panelhead');
    if (sectionHeader && !$('#add-category')) {
      const button = document.createElement('button');
      button.id = 'add-category'; button.className = 'small-action'; button.type = 'button'; button.textContent = '+ إضافة قسم';
      sectionHeader.appendChild(button); button.addEventListener('click', () => openModal());
    }
    $('#category-cancel').addEventListener('click', closeModal);
    $('#category-modal').addEventListener('click', (event) => { if (event.target.id === 'category-modal') closeModal(); });
    $('#category-image-file').addEventListener('change', () => {
      const file = $('#category-image-file').files[0];
      if (!file) return $('#category-image-selected').textContent = '';
      $('#category-image-selected').textContent = `${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`;
      setPreview(URL.createObjectURL(file)); $('#category-remove-image').hidden = false;
    });
    $('#category-remove-image').addEventListener('click', async () => {
      if (!editingId) { $('#category-image-file').value=''; $('#category-image-selected').textContent=''; setPreview(''); $('#category-remove-image').hidden=true; return; }
      if (!confirm('حذف صورة هذا القسم؟')) return;
      try { await deleteImage(editingId); await load(); const updated=categories.find(c=>c.id===editingId); $('#category-image-file').value=''; $('#category-image-selected').textContent=''; setPreview(updated?.imageUrl||''); $('#category-remove-image').hidden=true; } catch(error) { alert(error.message); }
    });
    $('#category-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = $('#category-form .submit'); const progress=$('#category-upload-progress'); submit.disabled=true;
      try {
        const payload={nameAr:$('#category-name-ar').value.trim(),nameEn:$('#category-name-en').value.trim(),imageUrl:$('#category-image-url').value.trim(),active:$('#category-active').checked};
        let saved = editingId ? await api(`/api/categories/${editingId}`, { method:'PATCH', body:JSON.stringify(payload) }) : await api('/api/categories', { method:'POST', body:JSON.stringify(payload) });
        const file=$('#category-image-file').files[0];
        if (file) {
          if (file.size>15*1024*1024) throw new Error('الحد الأقصى لصورة القسم 15MB.');
          if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('الصيغ المسموحة: JPG وPNG وWebP وAVIF.');
          progress.hidden=false; progress.querySelector('span').style.width='0%'; progress.querySelector('small').textContent='جاري رفع صورة القسم… 0%';
          const key=await uploadImage(saved.id,file,(percent)=>{progress.querySelector('span').style.width=`${percent}%`;progress.querySelector('small').textContent=`جاري رفع صورة القسم… ${percent}%`;});
          saved=await api(`/api/categories/${saved.id}`,{method:'PATCH',body:JSON.stringify({imageKey:key,imageUrl:''})});
        }
        progress.hidden=true; closeModal(); await load();
      } catch(error) { progress.hidden=true; alert(error.message); } finally { submit.disabled=false; }
    });
    $('#categories-body').addEventListener('click', async (event) => {
      const editId=event.target.dataset.categoryEdit, deleteId=event.target.dataset.categoryDelete, toggleId=event.target.dataset.id;
      if (editId) return openModal(categories.find((category)=>category.id===editId));
      if (toggleId && event.target.classList.contains('category-toggle')) {
        const category=categories.find((item)=>item.id===toggleId); if(!category) return;
        try { await api(`/api/categories/${toggleId}`,{method:'PATCH',body:JSON.stringify({active:category.active===false})}); await load(); } catch(error){ alert(error.message); }
      }
      if (deleteId) {
        const category=categories.find((item)=>item.id===deleteId); if(!category) return;
        if(!confirm(`حذف القسم «${category.nameAr}»؟`)) return;
        try { await api(`/api/categories/${deleteId}`,{method:'DELETE'}); await load(); } catch(error){ alert(error.message); }
      }
    });
    document.addEventListener('click', (event) => { if (event.target.closest('[data-section="categories"]')) setTimeout(() => load().catch(() => {}), 0); });
    load().catch((error)=>console.error('Category manager:', error));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  return { load };
})();
