import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const categories = [
  ['Breakfast','الفطور','Breakfast'], ['Manakish','المناقيش','Manakish'], ['Cold Appetizers','المقبلات الباردة','Cold Appetizers'],
  ['Hot Appetizers','المقبلات الساخنة','Hot Appetizers'], ['Salads','السلطات','Salads'], ['Soups','الشوربات','Soups'],
  ['Sandwich','السندويتش','Sandwich'], ['Pizza','البيتزا','Pizza'], ['Pasta','الباستا','Pasta'],
  ['Main Course','الأطباق الرئيسية','Main Course'], ['Mixed Grill','المشاوي المشكلة','Mixed Grill'], ['Mixed Taste','المذاق المشكل','Mixed Taste'],
  ['Desserts','الحلويات','Desserts'], ['Cheese Cake','تشيز كيك','Cheese Cake'], ['Arabisk Ice Cream','آيس كريم أرابيسك','Arabisk Ice Cream'],
  ['Cocktail & Refreshing Drinks','الكوكتيلات والمشروبات المنعشة','Cocktail & Refreshing Drinks'], ['Energy Drinks','مشروبات الطاقة','Energy Drinks'],
  ['Juices','العصائر','Juices'], ['Mojitos','الموهيتو','Mojitos'], ['Milk Shakes','ميلك شيك','Milk Shakes'], ['Tea','الشاي','Tea'],
  ['Coffee','القهوة','Coffee'], ['Latte','اللاتيه','Latte'], ['Soft Drinks','المشروبات الغازية','Soft Drinks'], ['Drinking Water','المياه','Drinking Water'], ['Sheesha','الشيشة','Sheesha']
].map(([id,nameAr,nameEn], index) => ({ id, nameAr, nameEn, sortOrder: index + 1, active: true }));

const products = [
  ['Breakfast','فطور أرابيسك','Arabisk Breakfast',94],['Breakfast','فطور الحارة','AL Hara Breakfast',84],
  ['Manakish','مناقيش زعتر','Zaatar Manakish',18],['Manakish','مناقيش جبنة','Cheese Manakish',22],
  ['Cold Appetizers','حمص','Hummus',24],['Cold Appetizers','حمص بيروتي','Hummus BeirutI',26],
  ['Hot Appetizers','بطاطا حارة','Spicy Potato',28],['Hot Appetizers','كبة مقلية','Fried Kibbeh',34],
  ['Salads','تبولة','Tabboulah',34],['Salads','فتوش','Fattoush',34],['Pizza','بيتزا مارغريتا','Pizza Margherita',46],
  ['Pizza','بيتزا بيبروني','Pizza Pepperoni',56],['Pasta','بيني ألفريدو','Penne Alfredo',56],['Pasta','سباجيتي بولونيز','Spaghetti Bolognese',52],
  ['Main Course','كوردون بلو','Cordon Bleu',68],['Mixed Grill','كباب','Kabab',48],['Mixed Grill','شيش طاووق','Shish Tawook',56],
  ['Desserts','كنافة','Kunafa',32],['Desserts','أم علي','UM Ali',34],['Juices','عصير برتقال','Orange Juice',26],
  ['Mojitos','كلاسيك موهيتو','Classic Mojito',32],['Coffee','قهوة تركية','Turkish Coffee',20],['Coffee','كابتشينو','Cappuccino',26],
  ['Tea','شاي أخضر','Green Tea',16],['Sheesha','تفاح ونعناع','Apple With Mint',65]
].map(([categoryId,nameAr,nameEn,price], index) => ({ id: `P${String(index+1).padStart(3,'0')}`, categoryId, nameAr, nameEn, descriptionAr: '', descriptionEn: '', price, available: true, sortOrder: index + 1 }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'arabisk-api' }));
app.get('/api/categories', (_req, res) => res.json(categories));
app.get('/api/products', (req, res) => {
  const category = req.query.category;
  res.json(category ? products.filter(p => p.categoryId === category) : products);
});
app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  return res.json(product);
});

app.listen(port, () => console.log(`ARABISK API listening on ${port}`));
