import crypto from 'node:crypto';
import { cleanText, cleanUrl } from '../utils/input.js';
import { createCollectionRepository } from '../repositories/collection-repository.js';

const EXPERIENCE_STATE_KEY='data/arabisk-experiences.json';
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const MAX_IMAGE_BYTES=15*1024*1024;
const MAX_VIDEO_BYTES=120*1024*1024;
const VIDEO_TYPES=new Set(['video/mp4','video/webm','video/quicktime']);
const STATUS_VALUES=new Set(['draft','published','closed','archived']);
const TYPE_VALUES=new Set(['event','music','chef','family','private','seasonal']);
const isValidDateTime=value=>Number.isFinite(Date.parse(String(value||'')));
const slugify=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);
const hasMedia=(url,key)=>Boolean(cleanUrl(url)||cleanText(key,500));
const mediaConflict=(imageUrl,imageKey,videoUrl,videoKey)=>hasMedia(imageUrl,imageKey)&&hasMedia(videoUrl,videoKey);
const experiences=[];
class ExperienceServiceError extends Error{constructor(message,status=400){super(message);this.name='ExperienceServiceError';this.status=status;}}

export function createExperienceService({storageReady,presign,readJsonWithStatus,writeJson,deleteObject,isAdminApiKeyValid}){
  const persist=()=>writeJson(EXPERIENCE_STATE_KEY,experiences);
  const experienceRepository=createCollectionRepository(experiences,{persist});
  const restore=async()=>{if(!storageReady)return;const result=await readJsonWithStatus(EXPERIENCE_STATE_KEY);if(!result.ok)throw new Error('Experience state could not be restored from storage.');const saved=result.value;if(Array.isArray(saved))experienceRepository.replaceAll(saved);};
  const nextId=()=> 'E'+crypto.randomUUID().slice(0,8).toUpperCase();
  const publicExperience=item=>({...item,coverImageUrl:item.coverImageKey&&storageReady?presign('GET',item.coverImageKey,900):(item.coverImageUrl||''),videoUrl:item.videoKey&&storageReady?presign('GET',item.videoKey,900):(item.videoUrl||'')});
  const presentExperience=(item,{includePrivate=false}={})=>{
    const value=publicExperience(item);
    if(includePrivate)return value;
    const { coverImageKey: _coverImageKey, videoKey: _videoKey, ...publicValue } = value;
    return publicValue;
  };
  const getOrThrow=id=>{const item=experienceRepository.find(entry=>entry.id===id);if(!item)throw new ExperienceServiceError('Experience not found',404);return item;};
  function list(req){const admin=isAdminApiKeyValid(req);return (admin?experienceRepository.all():experienceRepository.filter(item=>item.status==='published')).slice().sort((a,b)=>(Date.parse(a.startsAt||'')||0)-(Date.parse(b.startsAt||'')||0)).map(item=>presentExperience(item,{includePrivate:admin}));}
  function get(key){const normalized=cleanText(key,120).toLowerCase();const item=experienceRepository.find(entry=>String(entry.id).toLowerCase()===normalized||String(entry.slug).toLowerCase()===normalized);if(!item)throw new ExperienceServiceError('Experience not found',404);return presentExperience(item);}
  function findBookable(slug){
    const normalized=cleanText(slug,90).toLowerCase();
    const item=experienceRepository.find(entry=>String(entry.slug||'').toLowerCase()===normalized&&entry.status==='published');
    if(!item || item.bookingEnabled===false) return null;
    const endTime=Date.parse(item.endsAt||item.startsAt||'');
    if(Number.isFinite(endTime)&&endTime<=Date.now()) return null;
    return { slug:item.slug, endsAt:item.endsAt||'', startsAt:item.startsAt||'' };
  }
  async function create(body){
    const titleAr=cleanText(body.titleAr,120),titleEn=cleanText(body.titleEn,140),startsAt=cleanText(body.startsAt,40),status=STATUS_VALUES.has(body.status)?body.status:'draft';
    if(!titleAr||!titleEn||!startsAt)throw new ExperienceServiceError('titleAr, titleEn and startsAt are required');
    if(!isValidDateTime(startsAt))throw new ExperienceServiceError('startsAt must be a valid date and time.');
    const endsAt=cleanText(body.endsAt,40);
    if(endsAt&&!isValidDateTime(endsAt))throw new ExperienceServiceError('endsAt must be a valid date and time.');
    if(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw new ExperienceServiceError('endsAt must be later than startsAt.');
    const baseSlug=slugify(body.slug)||('experience-'+crypto.randomUUID().slice(0,8).toLowerCase());
    let slug=baseSlug,suffix=2;while(experienceRepository.some(item=>item.slug===slug))slug=baseSlug+'-'+suffix++;
    const type=TYPE_VALUES.has(body.type)?body.type:'event';
    const coverImageUrl=cleanUrl(body.coverImageUrl),coverImageKey=cleanText(body.coverImageKey,500),videoUrl=cleanUrl(body.videoUrl),videoKey=cleanText(body.videoKey,500);
    if(mediaConflict(coverImageUrl,coverImageKey,videoUrl,videoKey))throw new ExperienceServiceError('اختر صورة أو فيديو للفعالية، وليس الاثنين معًا.');
    const now=new Date().toISOString();
    const item={id:nextId(),slug,titleAr,titleEn,eyebrow:cleanText(body.eyebrow||'ARABISK EXPERIENCES',80),type,descriptionAr:cleanText(body.descriptionAr,1200),descriptionEn:cleanText(body.descriptionEn,1200),startsAt,endsAt,location:cleanText(body.location,180),capacity:Math.max(0,Math.min(5000,Number(body.capacity)||0)),price:Math.max(0,Number(body.price)||0),status,featured:Boolean(body.featured),bookingEnabled:body.bookingEnabled===undefined?true:Boolean(body.bookingEnabled),coverImageUrl,coverImageKey,videoUrl,videoKey,createdAt:now,updatedAt:now};
    experienceRepository.add(item);await experienceRepository.save();return publicExperience(item);
  }
  async function update(id,body){
    const item=getOrThrow(id);
    const nextStarts=body.startsAt!==undefined?cleanText(body.startsAt,40):item.startsAt,nextEnds=body.endsAt!==undefined?cleanText(body.endsAt,40):item.endsAt;
    if(!isValidDateTime(nextStarts))throw new ExperienceServiceError('startsAt must be a valid date and time.');
    if(nextEnds&&!isValidDateTime(nextEnds))throw new ExperienceServiceError('endsAt must be a valid date and time.');
    if(nextEnds&&Date.parse(nextEnds)<=Date.parse(nextStarts))throw new ExperienceServiceError('endsAt must be later than startsAt.');
    if(body.type!==undefined&&!TYPE_VALUES.has(body.type))throw new ExperienceServiceError('Invalid experience type');
    const nextCoverImageUrl=body.coverImageUrl!==undefined?cleanUrl(body.coverImageUrl):item.coverImageUrl,nextCoverImageKey=body.coverImageKey!==undefined?cleanText(body.coverImageKey,500):item.coverImageKey,nextVideoUrl=body.videoUrl!==undefined?cleanUrl(body.videoUrl):item.videoUrl,nextVideoKey=body.videoKey!==undefined?cleanText(body.videoKey,500):item.videoKey;
    if(mediaConflict(nextCoverImageUrl,nextCoverImageKey,nextVideoUrl,nextVideoKey))throw new ExperienceServiceError('اختر صورة أو فيديو للفعالية، وليس الاثنين معًا.');
    if(body.titleAr!==undefined)item.titleAr=cleanText(body.titleAr,120);
    if(body.titleEn!==undefined)item.titleEn=cleanText(body.titleEn,140);
    if(body.slug!==undefined){const next=slugify(body.slug);if(!next)throw new ExperienceServiceError('Invalid slug');if(experienceRepository.some(entry=>entry.id!==item.id&&entry.slug===next))throw new ExperienceServiceError('Slug already exists',409);item.slug=next;}
    if(body.eyebrow!==undefined)item.eyebrow=cleanText(body.eyebrow,80);
    if(body.type!==undefined)item.type=body.type;
    if(body.descriptionAr!==undefined)item.descriptionAr=cleanText(body.descriptionAr,1200);
    if(body.descriptionEn!==undefined)item.descriptionEn=cleanText(body.descriptionEn,1200);
    item.startsAt=nextStarts;item.endsAt=nextEnds;
    if(body.location!==undefined)item.location=cleanText(body.location,180);
    if(body.capacity!==undefined)item.capacity=Math.max(0,Math.min(5000,Number(body.capacity)||0));
    if(body.price!==undefined)item.price=Math.max(0,Number(body.price)||0);
    if(body.status!==undefined){if(!STATUS_VALUES.has(body.status))throw new ExperienceServiceError('Invalid experience status');item.status=body.status;}
    if(body.featured!==undefined)item.featured=Boolean(body.featured);
    if(body.bookingEnabled!==undefined)item.bookingEnabled=Boolean(body.bookingEnabled);
    if(body.coverImageUrl!==undefined){item.coverImageUrl=nextCoverImageUrl;if(item.coverImageUrl&&item.coverImageKey){const oldKey=item.coverImageKey;item.coverImageKey='';if(storageReady)void deleteObject(oldKey);}}
    if(body.coverImageKey!==undefined){const oldKey=item.coverImageKey||'';item.coverImageKey=nextCoverImageKey;if(storageReady&&oldKey&&oldKey!==item.coverImageKey)void deleteObject(oldKey);}
    if(body.videoUrl!==undefined){item.videoUrl=nextVideoUrl;if(item.videoUrl&&item.videoKey){const oldKey=item.videoKey;item.videoKey='';if(storageReady)void deleteObject(oldKey);}}
    if(body.videoKey!==undefined){const oldKey=item.videoKey||'';item.videoKey=nextVideoKey;if(storageReady&&oldKey&&oldKey!==item.videoKey)void deleteObject(oldKey);}
    item.updatedAt=new Date().toISOString();await experienceRepository.save();return publicExperience(item);
  }
  async function remove(id){const removed=experienceRepository.removeById(id);if(!removed)throw new ExperienceServiceError('Experience not found',404);if(storageReady){if(removed.coverImageKey)void deleteObject(removed.coverImageKey);if(removed.videoKey)void deleteObject(removed.videoKey);}await experienceRepository.save();return {ok:true,removed};}
  function presignImage(body){if(!storageReady)throw new ExperienceServiceError('Image storage is not configured on the web service.',503);const experienceId=cleanText(body?.experienceId,40),fileName=cleanText(body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'),contentType=cleanText(body?.contentType,80).toLowerCase(),size=Number(body?.size);if(experienceId&&!experienceRepository.some(item=>item.id===experienceId))throw new ExperienceServiceError('Experience not found',404);if(!fileName||!IMAGE_TYPES.has(contentType))throw new ExperienceServiceError('Only JPG, PNG, WebP and AVIF images are supported.');if(!Number.isFinite(size)||size<1||size>MAX_IMAGE_BYTES)throw new ExperienceServiceError('Maximum experience image size is 15 MB.');const targetId=experienceId||('new-'+crypto.randomUUID()),key='experiences/'+targetId+'/'+crypto.randomUUID()+'-'+fileName;try{return {key,uploadUrl:presign('PUT',key,900),expiresIn:900};}catch(error){console.error(error);throw new ExperienceServiceError('Unable to prepare experience image upload.',503);}}
  function presignVideo(body){if(!storageReady)throw new ExperienceServiceError('Video storage is not configured on the web service.',503);const experienceId=cleanText(body?.experienceId,40),fileName=cleanText(body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'),contentType=cleanText(body?.contentType,80).toLowerCase(),size=Number(body?.size);if(!experienceId||!experienceRepository.some(item=>item.id===experienceId))throw new ExperienceServiceError('Experience not found',404);if(!fileName||!VIDEO_TYPES.has(contentType))throw new ExperienceServiceError('Only MP4, WebM and MOV videos are supported.');if(!Number.isFinite(size)||size<1||size>MAX_VIDEO_BYTES)throw new ExperienceServiceError('Maximum experience video size is 120 MB.');const key='experiences/'+experienceId+'/videos/'+crypto.randomUUID()+'-'+fileName;try{return {key,uploadUrl:presign('PUT',key,900),expiresIn:900};}catch(error){console.error(error);throw new ExperienceServiceError('Unable to prepare experience video upload.',503);}}
  function presignVideoDelete(body){if(!storageReady)throw new ExperienceServiceError('Video storage is not configured on the web service.',503);const item=getOrThrow(cleanText(body?.experienceId,40));if(!item.videoKey)return {url:'',key:''};try{return {url:presign('DELETE',item.videoKey,900),key:item.videoKey};}catch(error){console.error(error);throw new ExperienceServiceError('Unable to prepare experience video deletion.',503);}}
  function presignImageDelete(body){if(!storageReady)throw new ExperienceServiceError('Image storage is not configured on the web service.',503);const item=getOrThrow(cleanText(body?.experienceId,40));if(!item.coverImageKey)return {url:'',key:''};try{return {url:presign('DELETE',item.coverImageKey,900),key:item.coverImageKey};}catch(error){console.error(error);throw new ExperienceServiceError('Unable to prepare experience image deletion.',503);}}
  const isAdmin=req=>isAdminApiKeyValid(req);
  return {restore,list,get,findBookable,create,update,remove,presignImage,presignVideo,presignVideoDelete,presignImageDelete,isAdmin};
}
