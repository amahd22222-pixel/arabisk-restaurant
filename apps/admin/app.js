const $ = (selector) => document.querySelector(selector);
const apiBase = () => (localStorage.getItem('ARABISK_API_BASE') || window.ARABISK_API_BASE || import.meta.env.VITE_API_BASE_URL || 'https://web-production-d41a3.up.railway.app').replace(/\/$/, '');
let products = [];
let categories = [];
let orders = [];
let customers = [];
let reservations = [];
let editingId = null;

const categoryName = (id) => categories.find((c) => c.id === id)?.nameAr || id;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const statusLabel = { pending: 'قيد المراجعة', confirmed: 'مؤكد', cancelled: 'ملغي' };
async function request(path, options = {}) { const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'حدث خطأ أثناء الاتصال بالخادم'); return data; }
function renderStats() { $('#count-products').textContent = products.length; $('#count-categories').textContent = categories.length; $('#count-available').textContent = products.filter((p) => p.available).length; $('#count-reservations').textContent = reservations.length; }
function renderProducts() {
  const query = $('#search').value.trim().toLowerCase();
  const filtered = products.filter((p) => !query || `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(query));
  $('#products-body').innerHTML = filtered.map((p) => `<tr><td><strong>${escapeHtml(p.nameAr)}</strong><small>${escapeHtml(p.nameEn)}</small></td><td>${escapeHtml(categoryName(p.categoryId))}</td><td class="price">AED ${Number(p.price).toFixed(0)}</td><td>${p.videoUrl ? '<span class="status on">متوفر</span>' : '<span class="status off">غير مضاف</span>'}</td><td><span class="status ${p.available ? 'on' : 'off'}">${p.available ? 'متاح' : 'مخفي'}</span></td><td class="actions"><button data-video="${p.id}">فيديو</button><button data-edit="${p.id}">تعديل</button><button data-delete="${p.id}" class="danger">حذف</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا توجد أصناف</td></tr>';
}
function renderCategories() { $('#categories-body').innerHTML = categories.map((c, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(c.nameAr)}</strong></td><td>${escapeHtml(c.nameEn)}</td><td><span class="status ${c.active ? 'on' : 'off'}">${c.active ? 'نشط' : 'مخفي'}</span></td></tr>`).join('') || '<tr><td colspan="4" class="empty">لا توجد أقسام</td></tr>'; }
function renderReservations() { const rows = reservations.map((r) => `<tr><td><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.notes || '—')}</small></td><td>${escapeHtml(r.date)}<small>${escapeHtml(r.time)}</small></td><td>${Number(r.guests)}</td><td dir="ltr">${escapeHtml(r.phone)}</td><td><span class="status ${r.status === 'confirmed' ? 'on' : r.status === 'cancelled' ? 'off' : 'pending'}">${statusLabel[r.status] || r.status}</span></td><td class="actions"><button data-status="confirmed" data-id="${r.id}">تأكيد</button><button data-status="cancelled" data-id="${r.id}" class="danger">إلغاء</button></td></tr>`).join(''); $('#reservations-body').innerHTML = rows || '<tr><td colspan="6" class="empty">لا توجد حجوزات حاليًا.</td></tr>'; }
function openModal(product = null) {
  editingId = product?.id || null;
  $('#modal-title').textContent = editingId ? 'تعديل الصنف' : 'إضافة صنف جديد';
  $('#name-ar').value = product?.nameAr || '';
  $('#name-en').value = product?.nameEn || '';
  $('#price').value = product?.price ?? '';
  $('#description-ar').value = product?.descriptionAr || '';
  $('#video-url').value = product?.videoUrl || '';
  $('#category').innerHTML = categories.map((c) => `<option value="${escapeHtml(c.id)}" ${product?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.nameAr)}</option>`).join('');
  $('#available').checked = product?.available ?? true;
  updateVideoPreview();
  $('#modal').classList.add('show'); $('#modal').setAttribute('aria-hidden', 'false'); $('#name-ar').focus();
}
function closeModal() { $('#modal').classList.remove('show'); $('#modal').setAttribute('aria-hidden', 'true'); editingId = null; }
function updateVideoPreview() { const url = $('#video-url').value.trim(); const wrap = $('#video-preview'); const player = $('#video-preview-player'); if (!url) { wrap.hidden = true; player.removeAttribute('src'); player.load(); return; } player.src = url; wrap.hidden = false; }
function showSection(sectionId) { document.querySelectorAll('.admin-section').forEach((section) => section.classList.remove('section-visible')); document.querySelectorAll('[data-section]').forEach((link) => link.classList.toggle('active', link.dataset.section === sectionId)); const titleMap = { dashboard: 'إدارة ARABISK', products: 'إدارة الأصناف', categories: 'إدارة الأقسام', reservations: 'حجوزات الطاولات', orders: 'الطلبات', customers: 'العملاء', settings: 'إعدادات الموقع' }; $('#page-title').textContent = titleMap[sectionId] || 'إدارة ARABISK'; $('#dashboard-stats').style.display = sectionId === 'dashboard' ? 'grid' : 'none'; const section = document.getElementById(sectionId === 'dashboard' ? 'products' : sectionId); if (section) section.classList.add('section-visible'); if (sectionId === 'dashboard') document.getElementById('products').classList.add('section-visible'); }
async function load() { $('#connection').textContent = 'جارٍ الاتصال…'; try { const results = await Promise.all([request('/api/categories'), request('/api/products'), request('/api/orders'), request('/api/customers'), request('/api/reservations')]); [categories, products, orders, customers, reservations] = results; renderStats(); renderProducts(); renderCategories(); renderReservations(); $('#orders-state').textContent = orders.length ? `${orders.length} طلب مسجل.` : 'لا توجد طلبات مسجلة حاليًا.'; $('#customers-state').textContent = customers.length ? `${customers.length} عميل مسجل.` : 'لا توجد بيانات عملاء مسجلة حاليًا.'; $('#connection').textContent = 'متصل'; $('#connection').className = 'connected'; $('#error').textContent = ''; } catch (error) { $('#connection').textContent = 'غير متصل'; $('#connection').className = 'disconnected'; $('#error').textContent = `${error.message}. تحقق من رابط الـAPI في الإعدادات.`; } }
function loadSettings() { $('#api-base').value = apiBase(); $('#site-name').value = localStorage.getItem('ARABISK_SITE_NAME') || 'ARABISK'; $('#site-description').value = localStorage.getItem('ARABISK_SITE_DESCRIPTION') || 'مطعم وكافيه بطابع عربي عصري.'; }
document.querySelectorAll('[data-section]').forEach((link) => link.addEventListener('click', () => setTimeout(() => showSection(link.dataset.section), 0)));
$('#add-product').addEventListener('click', () => openModal()); $('#cancel').addEventListener('click', closeModal); $('#search').addEventListener('input', renderProducts); $('#refresh-reservations').addEventListener('click', load); $('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); }); $('#video-url').addEventListener('input', updateVideoPreview);
$('#products-body').addEventListener('click', async (event) => {
  const edit = event.target.dataset.edit; const del = event.target.dataset.delete; const video = event.target.dataset.video;
  if (edit) return openModal(products.find((p) => p.id === edit));
  if (video) { const product = products.find((p) => p.id === video); if (!product?.videoUrl) return alert('لا يوجد فيديو تحضير مضاف لهذا الصنف.'); window.open(product.videoUrl, '_blank', 'noopener'); return; }
  if (del) { const product = products.find((p) => p.id === del); if (!product || !confirm(`حذف «${product.nameAr}»؟`)) return; try { await request(`/api/products/${del}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); } }
});
$('#reservations-body').addEventListener('click', async (event) => { const id = event.target.dataset.id; const status = event.target.dataset.status; if (!id || !status) return; try { await request(`/api/reservations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); } catch (error) { alert(error.message); } });
$('#product-form').addEventListener('submit', async (event) => { event.preventDefault(); const payload = { categoryId: $('#category').value, nameAr: $('#name-ar').value, nameEn: $('#name-en').value, descriptionAr: $('#description-ar').value, price: Number($('#price').value), available: $('#available').checked, videoUrl: $('#video-url').value.trim() }; try { await request(editingId ? `/api/products/${editingId}` : '/api/products', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); closeModal(); await load(); } catch (error) { alert(error.message); } });
$('#settings-form').addEventListener('submit', (event) => { event.preventDefault(); const value = $('#api-base').value.trim().replace(/\/$/, ''); if (!/^https?:\/\//i.test(value)) return ($('#settings-message').textContent = 'رابط الـAPI يجب أن يبدأ بـ http:// أو https://'); localStorage.setItem('ARABISK_API_BASE', value); localStorage.setItem('ARABISK_SITE_NAME', $('#site-name').value.trim() || 'ARABISK'); localStorage.setItem('ARABISK_SITE_DESCRIPTION', $('#site-description').value.trim()); $('#settings-message').textContent = 'تم حفظ الإعدادات. جارٍ إعادة الاتصال…'; load(); });
loadSettings(); showSection(location.hash ? location.hash.slice(1) : 'dashboard'); load();
