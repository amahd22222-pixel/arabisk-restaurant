const grid = document.querySelector('#grid');
const chips = document.querySelectorAll('.chips button');
const API = '/api/products';
const categoryMap = {
  'الكل': { type: 'all' },
  'الفطور': { type: 'category', value: 'Breakfast' },
  'المقبلات': { type: 'categories', value: ['Cold Appetizers', 'Hot Appetizers', 'Salads', 'Soups'] },
  'البيتزا': { type: 'category', value: 'Pizza' },
  'المشاوي': { type: 'categories', value: ['Mixed Grill', 'Main Course'] },
  'الحلويات': { type: 'categories', value: ['Desserts', 'Cheese Cake', 'Arabisk Ice Cream'] },
  'المشروبات': { type: 'categories', value: ['Cocktail & Refreshing Drinks', 'Energy Drinks', 'Juices', 'Mojitos', 'Milk Shakes', 'Tea', 'Coffee', 'Latte', 'Soft Drinks', 'Drinking Water'] }
};
let selectedFilter = { type: 'all' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function loadProducts(filter = selectedFilter) {
  if (!filter || filter.type === 'all') {
    const response = await fetch(API);
    if (!response.ok) throw new Error('Unable to load menu');
    return response.json();
  }

  if (filter.type === 'category') {
    const response = await fetch(`${API}?category=${encodeURIComponent(filter.value)}`);
    if (!response.ok) throw new Error('Unable to load menu');
    return response.json();
  }

  const response = await fetch(API);
  if (!response.ok) throw new Error('Unable to load menu');
  const items = await response.json();
  return items.filter((item) => filter.value.includes(item.categoryId));
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
  selectedFilter = categoryMap[button.textContent] || { type: 'all' };
  await refresh();
}));

refresh();
