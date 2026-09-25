import crypto from 'node:crypto';
import { cleanText, cleanKey, cleanUrl } from '../utils/input.js';
import { readRequiredSnapshot, writeRequiredSnapshot } from '../repositories/restore-helper.js';
import { logServiceFailure } from '../utils/service-error.js';

const CATEGORY_STATE_KEY='data/arabisk-categories.json';
const MAX_CATEGORY_IMAGE_BYTES=15*1024*1024;
const CATEGORY_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif']);
class CategoryServiceError extends Error{constructor(message,status=400){super(message);this.name='CategoryServiceError';this.status=status;}}

export function createCategoryService({categoriesRepository,productsRepository,storageReady,presign,readJsonWithStatus,writeJson,deleteObject,isAdminApiKeyValid}){
  const categories = categoriesRepository;
  const products = productsRepository;
  const restore=async()=>{if(!storageReady)return;const saved=await readRequiredSnapshot(readJsonWithStatus,CATEGORY_STATE_KEY,'Category state could not be restored from storage.');if(Array.isArray(saved)&&saved.length)categories.replaceAll(saved);};
  const persist=()=>writeRequiredSnapshot(writeJson,CATEGORY_STATE_KEY,categories.all(),'Category state could not be persisted to storage.');
  const nextId=()=>{const max=categories.all().reduce((n,c)=>{const m=String(c.id||'').match(/^C(\d+)$/);return Math.max(n,m?Number(m[1]):0);},0);return 'C'+String(max+1).padStart(3,'0');};
  const publicCategory=c=>({...c,imageUrl:c.imageKey&&storageReady?presign('GET',c.imageKey,900):(c.imageUrl||'')});
  const presentCategory=(category,{includePrivate=false}={})=>{
    const value=publicCategory(category);
    if(includePrivate)return value;
    const { imageKey: _imageKey, ...publicValue } = value;
    return publicValue;
  };
  const getOrThrow=id=>{const category=categories.find(c=>c.id===id);if(!category)throw new CategoryServiceError('Category not found',404);return category;};
  function list(req){const admin=isAdminApiKeyValid(req);const visible=admin?categories.all():categories.filter(c=>c.active!==false);return visible.map(category=>presentCategory(category,{includePrivate:admin}));}
  async function create(body){
    const nameAr=cleanText(body.nameAr,100),nameEn=cleanText(body.nameEn,120);
    if(!nameAr||!nameEn)throw new CategoryServiceError('nameAr and nameEn are required');
    if(categories.some(c=>c.nameAr===nameAr||c.nameEn.toLowerCase()===nameEn.toLowerCase()))throw new CategoryServiceError('Category with the same name already exists',409);
    const category={id:nextId(),nameAr,nameEn,imageUrl:cleanUrl(body.imageUrl),imageKey:cleanKey(body.imageKey),sortOrder:categories.all().length+1,active:body.active!==undefined?Boolean(body.active):true};
    categories.add(category);await persist();return publicCategory(category);
  }
  async function update(id,body){
    const category=getOrThrow(id);
    const nextNameAr=body.nameAr!==undefined?cleanText(body.nameAr,100):category.nameAr;
    const nextNameEn=body.nameEn!==undefined?cleanText(body.nameEn,120):category.nameEn;
    if(!nextNameAr)throw new CategoryServiceError('Arabic category name cannot be empty');
    if(!nextNameEn)throw new CategoryServiceError('English category name cannot be empty');
    if(categories.some(x=>x.id!==category.id&&(x.nameAr===nextNameAr||x.nameEn.toLowerCase()===nextNameEn.toLowerCase())))throw new CategoryServiceError('Category with the same name already exists',409);

    const oldImageKey=category.imageKey||'';
    const nextImageUrl=body.imageUrl!==undefined?cleanUrl(body.imageUrl):category.imageUrl;
    const nextImageKey=body.imageKey!==undefined?cleanKey(body.imageKey):category.imageKey;
    category.nameAr=nextNameAr;
    category.nameEn=nextNameEn;
    if(body.active!==undefined)category.active=Boolean(body.active);
    if(body.sortOrder!==undefined&&Number.isFinite(Number(body.sortOrder)))category.sortOrder=Math.max(1,Number(body.sortOrder));
    if(body.imageUrl!==undefined){category.imageUrl=nextImageUrl;if(nextImageUrl&&category.imageKey){category.imageKey='';if(storageReady)void deleteObject(oldImageKey);}}
    if(body.imageKey!==undefined)category.imageKey=nextImageKey;
    if(storageReady&&body.imageKey!==undefined&&oldImageKey&&oldImageKey!==category.imageKey)void deleteObject(oldImageKey);
    await persist();return publicCategory(category);
  }
  async function remove(id){
    const category=categories.findById(id);if(!category)throw new CategoryServiceError('Category not found',404);
    const index=categories.all().findIndex(c=>c.id===id);if(index<0)throw new CategoryServiceError('Category not found',404);
    const linked=products.filter(p=>p.categoryId===category.id).length;
    if(linked)throw new CategoryServiceError('لا يمكن حذف القسم لأنه يحتوي على '+linked+' صنف. انقل الأصناف إلى قسم آخر أولاً.',409);
    categories.removeById(id);if(storageReady&&category.imageKey)void deleteObject(category.imageKey);categories.all().forEach((x,n)=>x.sortOrder=n+1);await persist();
    return {ok:true,removed:category};
  }
  function presignImage(body){
    if(!storageReady)throw new CategoryServiceError('Image storage is not configured on the web service.',503);
    const categoryId=cleanText(body?.categoryId,40),fileName=cleanText(body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'),contentType=cleanText(body?.contentType,80).toLowerCase(),size=Number(body?.size);
    if(categoryId&&!categories.some(c=>c.id===categoryId))throw new CategoryServiceError('Category not found',404);
    if(!fileName||!CATEGORY_IMAGE_TYPES.has(contentType))throw new CategoryServiceError('Only JPG, PNG, WebP and AVIF images are supported.');
    if(!Number.isFinite(size)||size<1||size>MAX_CATEGORY_IMAGE_BYTES)throw new CategoryServiceError('Maximum category image size is 15 MB.');
    const targetId=categoryId||'new-'+crypto.randomUUID();const key='categories/'+targetId+'/'+crypto.randomUUID()+'-'+fileName;
    try{return {key,uploadUrl:presign('PUT',key,900),expiresIn:900};}catch(error){logServiceFailure(error,{service:'category',operation:'presignImage'});throw new CategoryServiceError('Unable to prepare category image upload.',503);}
  }
  function presignImageDelete(body){
    if(!storageReady)throw new CategoryServiceError('Image storage is not configured on the web service.',503);
    const category=getOrThrow(cleanText(body?.categoryId,40));if(!category.imageKey)return {url:'',key:''};
    try{return {url:presign('DELETE',category.imageKey,900),key:category.imageKey};}catch(error){logServiceFailure(error,{service:'category',operation:'presignImageDelete'});throw new CategoryServiceError('Unable to prepare category image deletion.',503);}
  }
  return {restore,list,create,update,remove,presignImage,presignImageDelete};
}