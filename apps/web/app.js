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
  'المشروبات': { type: 'categories', value: ['Cocktail & Refreshing Drinks', 'Energy Drinks', 'Juices', 'Mojitos', 'Milk Shakes', 'Tea', 'Coffee', 'Latte', 'Soft Drinks', 'Drinking Water', 'Sheesha'] }
};
const translations = {
  ar: { home:'الرئيسية', menu:'المنيو', about:'عن المطعم', contact:'تواصل معنا', eyebrow:'RESTAURANT & CAFE', hero1:'مذاق عربي', hero2:'بروح عصرية', lead:'تجربة ضيافة عربية تجمع بين الأطباق الأصيلة والأجواء الراقية.', explore:'استكشف المنيو', heroCard:'Authentic<br/>Arabic Taste', ourMenu:'OUR MENU', menuTitle:'قائمة الطعام', menuLead:'مختارات من أطباقنا ومشروباتنا المميزة', experience:'THE ARABISK EXPERIENCE', aboutTitle:'أكثر من مجرد وجبة', aboutLead:'هوية عربية دافئة، تفاصيل فاخرة، وأطباق صُممت لتُشارك وتُستمتع بها.', copyright:'© 2026 ARABISK. All rights reserved.' },
  en: { home:'Home', menu:'Menu', about:'About Us', contact:'Contact', eyebrow:'RESTAURANT & CAFE', hero1:'Authentic Arabic', hero2:'with a Modern Spirit', lead:'An Arabic hospitality experience blending authentic dishes with an elegant atmosphere.', explore:'Explore the Menu', heroCard:'Authentic<br/>Arabic Taste', ourMenu:'OUR MENU', menuTitle:'Our Menu', menuLead:'A selection of our signature dishes and drinks', experience:'THE ARABISK EXPERIENCE', aboutTitle:'More Than a Meal', aboutLead:'A warm Arabic identity, refined details, and dishes designed to be shared and enjoyed.', copyright:'© 2026 ARABISK. All rights reserved.' }
};
const chipLabels = {
  ar: ['الكل','الفطور','المقبلات','البيتزا','المشاوي','الحلويات','المشروبات'],
  en: ['All','Breakfast','Appetizers','Pizza','Grill','Desserts','Drinks']
};
let selectedFilter = { type: 'all' };
let language = localStorage.getItem('ARABISK_LANG') || 'ar';

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
  const isEn = language === 'en';
  grid.innerHTML = items.map((item) => `<article class="item"><span class="cat">${escapeHtml(item.nameEn)}</span><div><h3>${escapeHtml(isEn ? item.nameEn : item.nameAr)}</h3><p>${escapeHtml(isEn ? (item.descriptionEn || 'A signature ARABISK selection.') : (item.descriptionAr || 'اختيار من قائمة ARABISK المميزة'))}</p></div><div class="price">AED ${Number(item.price).toFixed(0)}</div></article>`).join('') || `<p>${isEn ? 'No items in this section.' : 'لا توجد أصناف في هذا القسم.'}</p>`;
}

function applyLanguage() {
  const strings = translations[language];
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = strings[node.dataset.i18n];
    if (value !== undefined) node.innerHTML = value;
  });
  document.querySelector('#lang-toggle').textContent = language === 'ar' ? 'EN' : 'ع';
  chips.forEach((button, index) => { button.textContent = chipLabels[language][index]; });
  refresh();
}

async function refresh() {
  try { render(await loadProducts()); }
  catch (error) { grid.innerHTML = `<p>${language === 'en' ? 'Unable to load the menu right now.' : 'تعذر تحميل المنيو حاليًا.'}</p>`; console.error(error); }
}

chips.forEach((button, index) => button.addEventListener('click', async () => {
  chips.forEach((x) => x.classList.remove('active'));
  button.classList.add('active');
  const originalLabel = ['الكل','الفطور','المقبلات','البيتزا','المشاوي','الحلويات','المشروبات'][index];
  selectedFilter = categoryMap[originalLabel] || { type: 'all' };
  await refresh();
}));

document.querySelector('#lang-toggle').addEventListener('click', () => {
  language = language === 'ar' ? 'en' : 'ar';
  localStorage.setItem('ARABISK_LANG', language);
  applyLanguage();
});

applyLanguage();
