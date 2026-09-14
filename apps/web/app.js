const grid = document.querySelector('#grid');
const chips = document.querySelectorAll('.chips button');
const API = '/api/products';
const categoryMap = { 'الكل':'', 'الفطور':'Breakfast', 'المقبلات':'Cold Appetizers', 'البيتزا':'Pizza', 'المشاوي':'Mixed Grill', 'الحلويات':'Desserts', 'المشروبات':'Coffee' };
let selectedCategory = '';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function loadProducts(category = selectedCategory) {
  const response = await fetch(category ? `${API}?category=${encodeURIComponent(category)}` : API);
  if (!response.ok) throw new Error('Unable to load menu');
  return response.json();
}

function render(items) {
  grid.innerHTML = items.map((item) => `<article class="item"><span class="cat">${escapeHtml(item.nameEn)}</span><div><h3>${escapeHtml(item.nameAr)}</h3><p>${escapeHtml(item.descriptionAr || 'اختيار من قائمة ARABISK المميزة')}</p></div><div class="price">AED ${Number(item.price).toFixed(0)}</div></article>`).join('') || '<p>لا توجد أصناف في هذا القسم.</p>';
}

async function refresh() {
  try {
    render(await loadProducts());
  } catch (error) {
    grid.innerHTML = `<p>تعذر تحميل المنيو حاليًا.</p>`;
    console.error(error);
  }
}

chips.forEach((button) => button.addEventListener('click', async () => {
  chips.forEach((x) => x.classList.remove('active'));
  button.classList.add('active');
  selectedCategory = categoryMap[button.textContent] || '';
  await refresh();
}));

refresh();
