const $ = (selector) => document.querySelector(selector);
const apiBase = () => (localStorage.getItem('ARABISK_API_BASE') || window.ARABISK_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
let products = [];
let categories = [];
let editingId = null;

const categoryName = (id) => categories.find((c) => c.id === id)?.nameAr || id;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));

async function request(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'حدث خطأ أثناء الاتصال بالخادم');
  return data;
}

function renderStats() {
  $('#count-products').textContent = products.length;
  $('#count-categories').textContent = categories.length;
  $('#count-available').textContent = products.filter((p) => p.available).length;
}

function renderProducts() {
  const query = $('#search').value.trim().toLowerCase();
  const filtered = products.filter((p) => !query || `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(query));
  $('#products-body').innerHTML = filtered.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.nameAr)}</strong><small>${escapeHtml(p.nameEn)}</small></td>
      <td>${escapeHtml(categoryName(p.categoryId))}</td>
      <td class="price">AED ${Number(p.price).toFixed(0)}</td>
      <td><span class="status ${p.available ? 'on' : 'off'}">${p.available ? 'متاح' : 'مخفي'}</span></td>
      <td class="actions"><button data-edit="${p.id}">تعديل</button><button data-delete="${p.id}" class="danger">حذف</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد أصناف</td></tr>';
}

function openModal(product = null) {
  editingId = product?.id || null;
  $('#modal-title').textContent = editingId ? 'تعديل الصنف' : 'إضافة صنف جديد';
  $('#name-ar').value = product?.nameAr || '';
  $('#name-en').value = product?.nameEn || '';
  $('#price').value = product?.price ?? '';
  $('#description-ar').value = product?.descriptionAr || '';
  $('#category').innerHTML = categories.map((c) => `<option value="${escapeHtml(c.id)}" ${product?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.nameAr)}</option>`).join('');
  $('#available').checked = product?.available ?? true;
  $('#modal').classList.add('show');
  $('#name-ar').focus();
}

function closeModal() {
  $('#modal').classList.remove('show');
  editingId = null;
}

async function load() {
  $('#connection').textContent = 'جارٍ الاتصال…';
  try {
    [categories, products] = await Promise.all([request('/api/categories'), request('/api/products')]);
    renderStats();
    renderProducts();
    $('#connection').textContent = 'متصل';
    $('#connection').className = 'connected';
  } catch (error) {
    $('#connection').textContent = 'غير متصل';
    $('#connection').className = 'disconnected';
    $('#error').textContent = `${error.message}. يمكنك ضبط رابط الـAPI من إعدادات المتصفح.`;
  }
}

$('#add-product').addEventListener('click', () => openModal());
$('#cancel').addEventListener('click', closeModal);
$('#search').addEventListener('input', renderProducts);
$('#modal').addEventListener('click', (event) => { if (event.target.id === 'modal') closeModal(); });

$('#products-body').addEventListener('click', async (event) => {
  const edit = event.target.dataset.edit;
  const del = event.target.dataset.delete;
  if (edit) return openModal(products.find((p) => p.id === edit));
  if (del) {
    const product = products.find((p) => p.id === del);
    if (!product || !confirm(`حذف «${product.nameAr}»؟`)) return;
    try { await request(`/api/products/${del}`, { method: 'DELETE' }); await load(); }
    catch (error) { alert(error.message); }
  }
});

$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    categoryId: $('#category').value,
    nameAr: $('#name-ar').value,
    nameEn: $('#name-en').value,
    descriptionAr: $('#description-ar').value,
    price: Number($('#price').value),
    available: $('#available').checked
  };
  try {
    await request(editingId ? `/api/products/${editingId}` : '/api/products', {
      method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload)
    });
    closeModal();
    await load();
  } catch (error) { alert(error.message); }
});

load();
