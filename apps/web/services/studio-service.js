import crypto from 'node:crypto';
import { cleanText, cleanKey } from '../utils/input.js';
import { createCollectionRepository } from '../repositories/collection-repository.js';
import { readRequiredSnapshot, writeRequiredSnapshot } from '../repositories/restore-helper.js';
import { logServiceFailure } from '../utils/service-error.js';
const STUDIO_STATE_KEY='data/arabisk-studio.json';
const MAX_VIDEO_BYTES=120*1024*1024;
const VIDEO_TYPES=new Set(['video/mp4','video/webm','video/quicktime']);
class StudioServiceError extends Error{constructor(message,status=400){super(message);this.name='StudioServiceError';this.status=status;}}
export function createStudioService({storageReady,presign,readJsonWithStatus,writeJson,deleteObject}){
  const studio=[];const persist=()=>writeRequiredSnapshot(writeJson,STUDIO_STATE_KEY,studio,'Studio state could not be persisted to storage.');const studioRepository=createCollectionRepository(studio,{persist});
  const restore=async()=>{if(!storageReady)return;const saved=await readRequiredSnapshot(readJsonWithStatus,STUDIO_STATE_KEY,'Studio state could not be restored from storage.');if(!Array.isArray(saved))return;const migrated=saved.some(x=>x&&('placement' in x||'categoryId' in x));const cleaned=saved.filter(x=>x&&x.id&&(x.placement||'home')==='home').map(x=>{const {placement,categoryId,...show}=x;return show;});studioRepository.replaceAll(cleaned);if(cleaned.length!==saved.length||migrated)await studioRepository.save();};
  const getOrThrow=id=>{const item=studioRepository.find(x=>x.id===id);if(!item)throw new StudioServiceError('Studio show not found',404);return item;};
  const nextId=()=>{const max=studioRepository.all().reduce((n,x)=>{const m=String(x.id||'').match(/^S(\d+)$/);return Math.max(n,m?Number(m[1]):0);},0);return 'S'+String(max+1).padStart(3,'0');};
  const publicShow=item=>item?{id:item.id,title:item.title||'',active:item.active!==false,sortOrder:Number(item.sortOrder)||1,desktopVideoUrl:item.desktopVideoKey&&storageReady?presign('GET',item.desktopVideoKey,900):'',mobileVideoUrl:item.mobileVideoKey&&storageReady?presign('GET',item.mobileVideoKey,900):''}:null;
  function list(query){const active=String(query?.active??'false')==='true';return studioRepository.filter(x=>!active||x.active!==false).slice().sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)).map(publicShow);}
  function get(id){return publicShow(getOrThrow(id));}
  async function create(body){const item={id:nextId(),title:cleanText(body.title,120),active:body.active!==undefined?Boolean(body.active):true,sortOrder:Number.isFinite(Number(body.sortOrder))?Math.max(1,Number(body.sortOrder)):studioRepository.all().length+1,desktopVideoKey:'',mobileVideoKey:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};studioRepository.add(item);await studioRepository.save();return publicShow(item);}
  async function update(id,body){
    const item=getOrThrow(id);
    const before=structuredClone(item);
    const hasD=Object.prototype.hasOwnProperty.call(body,'desktopVideoKey');
    const hasM=Object.prototype.hasOwnProperty.call(body,'mobileVideoKey');
    const nextD=hasD?cleanKey(body.desktopVideoKey):(item.desktopVideoKey||'');
    const nextM=hasM?cleanKey(body.mobileVideoKey):(item.mobileVideoKey||'');
    if(body.title!==undefined)item.title=cleanText(body.title,120);
    if(body.active!==undefined)item.active=Boolean(body.active);
    if(body.sortOrder!==undefined&&Number.isFinite(Number(body.sortOrder)))item.sortOrder=Math.max(1,Number(body.sortOrder));
    item.desktopVideoKey=nextD;
    item.mobileVideoKey=nextM;
    item.updatedAt=new Date().toISOString();
    try{
      await studioRepository.save();
    }catch(error){
      Object.assign(item,before);
      throw error;
    }
    if(storageReady&&hasD&&before.desktopVideoKey&&before.desktopVideoKey!==item.desktopVideoKey){
      const deleted=await deleteObject(before.desktopVideoKey);
      if(!deleted)logServiceFailure(new Error('Studio old desktop video could not be deleted.'),{service:'studio',operation:'cleanupDesktopMedia'});
    }
    if(storageReady&&hasM&&before.mobileVideoKey&&before.mobileVideoKey!==item.mobileVideoKey){
      const deleted=await deleteObject(before.mobileVideoKey);
      if(!deleted)logServiceFailure(new Error('Studio old mobile video could not be deleted.'),{service:'studio',operation:'cleanupMobileMedia'});
    }
    return publicShow(item);
  }
  async function remove(id){
    const before=studioRepository.all().slice();
    const item=studioRepository.removeById(id);
    if(!item)throw new StudioServiceError('Studio show not found',404);
    studioRepository.all().forEach((x,n)=>x.sortOrder=n+1);
    try{
      await studioRepository.save();
    }catch(error){
      studioRepository.replaceAll(before);
      throw error;
    }
    if(storageReady&&item.desktopVideoKey&&!await deleteObject(item.desktopVideoKey)){
      logServiceFailure(new Error('Studio desktop video cleanup failed.'),{service:'studio',operation:'removeDesktopMedia'});
    }
    if(storageReady&&item.mobileVideoKey&&!await deleteObject(item.mobileVideoKey)){
      logServiceFailure(new Error('Studio mobile video cleanup failed.'),{service:'studio',operation:'removeMobileMedia'});
    }
    return {ok:true,removed:item};
  }
  function presignMedia(id,body){if(!storageReady)throw new StudioServiceError('Video storage is not configured on the web service.',503);const item=getOrThrow(id);const slot=body?.slot==='mobile'?'mobile':'desktop';const fileName=cleanText(body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-');const contentType=cleanText(body?.contentType,80).toLowerCase();const size=Number(body?.size);if(!fileName||!VIDEO_TYPES.has(contentType))throw new StudioServiceError('Only MP4, WebM and MOV videos are supported.');if(!Number.isFinite(size)||size<1||size>MAX_VIDEO_BYTES)throw new StudioServiceError('Maximum Studio video size is 120 MB.');const key='studio/'+item.id+'/'+slot+'/'+crypto.randomUUID()+'-'+fileName;try{return {key,uploadUrl:presign('PUT',key,900),expiresIn:900};}catch(error){logServiceFailure(error,{service:'studio',operation:'presignMedia'});throw new StudioServiceError('Unable to prepare Studio upload.',503);}}
  function presignDelete(id,body){if(!storageReady)throw new StudioServiceError('Video storage is not configured on the web service.',503);const item=getOrThrow(id);const slot=body?.slot==='mobile'?'mobile':'desktop';const key=slot==='mobile'?item.mobileVideoKey:item.desktopVideoKey;if(!key)return {url:'',key:''};try{return {url:presign('DELETE',key,900),key};}catch(error){logServiceFailure(error,{service:'studio',operation:'presignDelete'});throw new StudioServiceError('Unable to prepare Studio deletion.',503);}}
  return {restore,list,get,create,update,remove,presignMedia,presignDelete};
}