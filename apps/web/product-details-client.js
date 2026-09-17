const slug=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const api=async(path)=>{const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error('request failed');return response.json()};
(async()=>{
  try{
    const parts=decodeURIComponent(location.pathname.replace(/\/$/,'')).split('/');
    const categorySlug=parts[2]||'';const productSlug=parts[3]||'';
    if(!categorySlug||!productSlug)return;
    const products=await api('/api/products');
    const product=products.find(item=>slug(item.nameEn||item.nameAr)===productSlug);
    if(!product)return;
    const details=await api(`/api/product-details/${encodeURIComponent(product.id)}`);
    const merged={...product,...details};
    if(typeof renderFacts==='function')renderFacts(merged);
    if(typeof renderDetails==='function')renderDetails(merged);
    if(typeof renderGallery==='function')renderGallery(merged);
  }catch(error){console.warn('ARABISK product detail data:',error)}
})();
