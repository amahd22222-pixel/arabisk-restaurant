import crypto from 'node:crypto';

const EXPERIENCE_STATE_KEY='data/arabisk-experiences.json';
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const MAX_IMAGE_BYTES=15*1024*1024;
const STATUS_VALUES=new Set(['draft','published','closed','archived']);
const cleanText=(value,max=240)=>String(value??'').trim().slice(0,max);
const cleanUrl=(value)=>String(value??'').trim().slice(0,1000);
const slugify=(value)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);
const publicExperience=(item,storageReady,presign)=>({...item,coverImageUrl:item.coverImageKey&&storageReady?presign('GET',item.coverImageKey,900):(item.coverImageUrl||'')});

export function registerExperienceRoutes(app,{storageReady,presign,readJson,writeJson,deleteObject,requireAdminApiKey,isAdminApiKeyValid}){
  
  const restore=async()=>{if(!storageReady)return;const saved=await readJson(EXPERIENCE_STATE_KEY,null);if(Array.isArray(saved))experiences.splice(0,experiences.length,...saved);};
  const persist=()=>void writeJson(EXPERIENCE_STATE_KEY,experiences);
  const nextId=()=> 'E'+crypto.randomUUID().slice(0,8).toUpperCase();

  app.get('/api/experiences',(req,res)=>{
    const admin=isAdminApiKeyValid(req);
    const list=(admin?experiences:experiences.filter(item=>item.status==='published')).slice().sort((a,b)=>(Date.parse(a.startsAt||'')||0)-(Date.parse(b.startsAt||'')||0));
    return res.json(list.map(item=>publicExperience(item,storageReady,presign)));
  });

  app.get('/api/experiences/:slugOrId',(req,res)=>{
    const key=cleanText(req.params.slugOrId,120).toLowerCase();
    const item=experiences.find(entry=>String(entry.id).toLowerCase()===key||String(entry.slug).toLowerCase()===key);
    if(!item||(item.status!=='published'&&!isAdminApiKeyValid(req)))return res.status(404).json({message:'Experience not found'});
    return res.json(publicExperience(item,storageReady,presign));
  });

  app.post('/api/experiences',requireAdminApiKey,(req,res)=>{
    const b=req.body||{};
    const titleAr=cleanText(b.titleAr,120),titleEn=cleanText(b.titleEn,140),startsAt=cleanText(b.startsAt,40);
    const status=STATUS_VALUES.has(b.status)?b.status:'draft';
    if(!titleAr||!titleEn||!startsAt)return res.status(400).json({message:'titleAr, titleEn and startsAt are required'});
    const baseSlug=slugify(b.slug||titleEn||titleAr);
    if(!baseSlug)return res.status(400).json({message:'A valid slug is required'});
    let slug=baseSlug,suffix=2;while(experiences.some(item=>item.slug===slug))slug=baseSlug+'-'+suffix++;
    const item={id:nextId(),slug,titleAr,titleEn,eyebrow:cleanText(b.eyebrow||'ARABISK EXPERIENCES',80),type:cleanText(b.type||'event',60),descriptionAr:cleanText(b.descriptionAr,1200),descriptionEn:cleanText(b.descriptionEn,1200),startsAt,endsAt:cleanText(b.endsAt,40),location:cleanText(b.location,180),capacity:Math.max(0,Math.min(5000,Number(b.capacity)||0)),price:Math.max(0,Number(b.price)||0),status,featured:Boolean(b.featured),bookingEnabled:b.bookingEnabled===undefined?true:Boolean(b.bookingEnabled),coverImageUrl:cleanUrl(b.coverImageUrl),coverImageKey:cleanText(b.coverImageKey,500),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    experiences.push(item);persist();return res.status(201).json(publicExperience(item,storageReady,presign));
  });

  app.patch('/api/experiences/:id',requireAdminApiKey,(req,res)=>{
    const item=experiences.find(entry=>entry.id===req.params.id);if(!item)return res.status(404).json({message:'Experience not found'});
    const b=req.body||{};
    if(b.titleAr!==undefined)item.titleAr=cleanText(b.titleAr,120);
    if(b.titleEn!==undefined)item.titleEn=cleanText(b.titleEn,140);
    if(b.slug!==undefined){const next=slugify(b.slug);if(!next)return res.status(400).json({message:'Invalid slug'});if(experiences.some(entry=>entry.id!==item.id&&entry.slug===next))return res.status(409).json({message:'Slug already exists'});item.slug=next;}
    if(b.eyebrow!==undefined)item.eyebrow=cleanText(b.eyebrow,80);
    if(b.type!==undefined)item.type=cleanText(b.type,60);
    if(b.descriptionAr!==undefined)item.descriptionAr=cleanText(b.descriptionAr,1200);
    if(b.descriptionEn!==undefined)item.descriptionEn=cleanText(b.descriptionEn,1200);
    if(b.startsAt!==undefined)item.startsAt=cleanText(b.startsAt,40);
    if(b.endsAt!==undefined)item.endsAt=cleanText(b.endsAt,40);
    if(b.location!==undefined)item.location=cleanText(b.location,180);
    if(b.capacity!==undefined)item.capacity=Math.max(0,Math.min(5000,Number(b.capacity)||0));
    if(b.price!==undefined)item.price=Math.max(0,Number(b.price)||0);
    if(b.status!==undefined){if(!STATUS_VALUES.has(b.status))return res.status(400).json({message:'Invalid experience status'});item.status=b.status;}
    if(b.featured!==undefined)item.featured=Boolean(b.featured);
    if(b.bookingEnabled!==undefined)item.bookingEnabled=Boolean(b.bookingEnabled);
    if(b.coverImageUrl!==undefined)item.coverImageUrl=cleanUrl(b.coverImageUrl);
    if(b.coverImageKey!==undefined){const oldKey=item.coverImageKey||'';item.coverImageKey=cleanText(b.coverImageKey,500);if(storageReady&&oldKey&&oldKey!==item.coverImageKey)void deleteObject(oldKey);}
    item.updatedAt=new Date().toISOString();persist();return res.json(publicExperience(item,storageReady,presign));
  });

  app.delete('/api/experiences/:id',requireAdminApiKey,(req,res)=>{
    const index=experiences.findIndex(entry=>entry.id===req.params.id);if(index<0)return res.status(404).json({message:'Experience not found'});
    const removed=experiences.splice(index,1)[0];if(storageReady&&removed.coverImageKey)void deleteObject(removed.coverImageKey);persist();return res.json({ok:true,removed});
  });

  app.post('/api/experiences/images/presign',requireAdminApiKey,(req,res)=>{
    if(!storageReady)return res.status(503).json({message:'Image storage is not configured on the web service.'});
    const experienceId=cleanText(req.body?.experienceId,40),fileName=cleanText(req.body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'),contentType=cleanText(req.body?.contentType,80).toLowerCase(),size=Number(req.body?.size);
    if(experienceId&&!experiences.some(item=>item.id===experienceId))return res.status(404).json({message:'Experience not found'});
    if(!fileName||!IMAGE_TYPES.has(contentType))return res.status(400).json({message:'Only JPG, PNG, WebP and AVIF images are supported.'});
    if(!Number.isFinite(size)||size<1||size>MAX_IMAGE_BYTES)return res.status(400).json({message:'Maximum experience image size is 15 MB.'});
    const targetId=experienceId||('new-'+crypto.randomUUID()),key='experiences/'+targetId+'/'+crypto.randomUUID()+'-'+fileName;
    try{return res.json({key,uploadUrl:presign('PUT',key,900),expiresIn:900});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare experience image upload.'});}
  });

  app.post('/api/experiences/images/delete-presign',requireAdminApiKey,(req,res)=>{
    if(!storageReady)return res.status(503).json({message:'Image storage is not configured on the web service.'});
    const item=experiences.find(entry=>entry.id===cleanText(req.body?.experienceId,40));if(!item)return res.status(404).json({message:'Experience not found'});
    if(!item.coverImageKey)return res.json({url:'',key:''});
    try{return res.json({url:presign('DELETE',item.coverImageKey,900),key:item.coverImageKey});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare experience image deletion.'});}
  });

  return restore;
}
