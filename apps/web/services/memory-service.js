import crypto from 'node:crypto';
import { cleanText as clean, cleanKey } from '../utils/input.js';
import { createCollectionRepository } from '../repositories/collection-repository.js';
import { readRequiredSnapshot, writeRequiredSnapshot } from '../repositories/restore-helper.js';

const STATE_KEY='data/arabisk-memories.json';
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const VIDEO_TYPES=new Set(['video/mp4','video/webm','video/quicktime']);

class MemoryServiceError extends Error{
  constructor(message,status=400){super(message);this.name='MemoryServiceError';this.status=status;}
}

export function createMemoryService({storageReady,presign,readJsonWithStatus,writeJson,deleteObject}){
  const state={memories:[]};
  let queue=Promise.resolve();

  const persist=()=>{
    const snapshot=structuredClone(state);
    queue=queue.catch(()=>{}).then(()=>writeRequiredSnapshot(writeJson,STATE_KEY,snapshot,'Memory state could not be persisted to storage.'));
    return queue;
  };

  const memoryRepository=createCollectionRepository(state.memories,{persist});

  const restore=async()=>{
    if(!storageReady)return;
    const saved=await readRequiredSnapshot(readJsonWithStatus,STATE_KEY,'Memory state could not be restored from storage.');
    if(saved&&Array.isArray(saved.memories))memoryRepository.replaceAll(saved.memories);
  };

  const publicMemory=m=>({
    id:m.id,text:m.text,mediaType:m.mediaType,
    imageUrl:m.imageKey&&storageReady?presign('GET',m.imageKey,900):'',
    videoUrl:m.videoKey&&storageReady?presign('GET',m.videoKey,900):'',
    displayName:m.displayName||'مجهول',createdAt:m.createdAt,
    likes:Number(m.likes||0),
    comments:Array.isArray(m.comments)?m.comments.map(c=>({id:c.id,text:c.text,displayName:c.displayName||'مجهول',createdAt:c.createdAt})):[],
    commentsCount:Array.isArray(m.comments)?m.comments.length:0,
    shareCount:Number(m.shareCount||0),pinned:Boolean(m.pinned),
    productId:clean(m.productId,50),experienceSlug:clean(m.experienceSlug,90)
  });

  const get=id=>{
    const m=memoryRepository.findById(id);
    if(!m)throw new MemoryServiceError('Memory not found',404);
    return m;
  };
  const getVisible=id=>{
    const m=get(id);
    if(m.hidden===true)throw new MemoryServiceError('Memory not found',404);
    return m;
  };

  function list(query){
    const popular=clean(query?.sort,20)==='popular';
    const page=Math.max(1,Math.min(100,Number.parseInt(query?.page,10)||1));
    const limit=Math.max(1,Math.min(20,Number.parseInt(query?.limit,10)||8));
    const items=memoryRepository.filter(m=>m.hidden!==true).map(publicMemory).sort((a,b)=>{
      const pinned=Number(Boolean(b.pinned))-Number(Boolean(a.pinned));
      if(pinned)return pinned;
      return popular
        ? (b.likes+b.commentsCount*2+b.shareCount)-(a.likes+a.commentsCount*2+a.shareCount)
        : String(b.createdAt).localeCompare(String(a.createdAt));
    });
    const start=(page-1)*limit;
    return {items:items.slice(start,start+limit),total:items.length,hasMore:start+limit<items.length};
  }

  function upload(body){
    if(!storageReady)throw new MemoryServiceError('تخزين الوسائط غير مُعد على الخدمة.',503);
    const type=clean(body?.contentType,80).toLowerCase(),size=Number(body?.size);
    const kind=IMAGE_TYPES.has(type)?'image':VIDEO_TYPES.has(type)?'video':'';
    const max=kind==='image'?15*1024*1024:120*1024*1024;
    if(!kind||!Number.isFinite(size)||size<1||size>max)throw new MemoryServiceError(kind==='image'?'الصورة يجب أن تكون حتى 15MB.':'الفيديو يجب أن يكون حتى 120MB.');
    const extension=clean(body?.fileName,80).split('.').pop()?.replace(/[^a-z0-9]/gi,'').toLowerCase()||(kind==='image'?'jpg':'mp4');
    const key='memories/'+new Date().toISOString().slice(0,10)+'/'+crypto.randomUUID()+'.'+extension;
    try{return {kind,key,uploadUrl:presign('PUT',key,900),expiresIn:900};}
    catch(error){console.error(error);throw new MemoryServiceError('تعذر تجهيز رفع الوسائط.',503);}
  }

  async function create(body){
    const text=clean(body.text,1200),displayName=clean(body.displayName,80)||'مجهول',imageKey=cleanKey(body.imageKey),videoKey=cleanKey(body.videoKey);
    if(!text&&!imageKey&&!videoKey)throw new MemoryServiceError('أضف نصًا أو صورة أو فيديو.');
    if(imageKey&&videoKey)throw new MemoryServiceError('يمكن نشر صورة أو فيديو واحد مع النص.');
    const memory={id:'M'+crypto.randomUUID().replace(/-/g,'').slice(0,16),text,displayName,imageKey,videoKey,productId:clean(body.productId,50),experienceSlug:clean(body.experienceSlug,90).toLowerCase(),mediaType:imageKey?'image':videoKey?'video':'text',likes:0,shareCount:0,comments:[],reports:[],hidden:false,pinned:false,createdAt:new Date().toISOString()};
    memoryRepository.add(memory);await memoryRepository.save();return publicMemory(memory);
  }

  async function like(id){const m=getVisible(id);m.likes=Number(m.likes||0)+1;await memoryRepository.save();return {likes:m.likes};}
  async function share(id){const m=getVisible(id);m.shareCount=Number(m.shareCount||0)+1;await memoryRepository.save();return {shareCount:m.shareCount};}
  async function comment(id,body){
    const m=getVisible(id),text=clean(body?.text,500),displayName=clean(body?.displayName,80)||'مجهول';
    if(!text)throw new MemoryServiceError('اكتب تعليقًا أولًا.');
    const item={id:crypto.randomUUID(),text,displayName,createdAt:new Date().toISOString()};
    m.comments.push(item);await memoryRepository.save();return {commentsCount:m.comments.length,comment:item};
  }
  async function report(id,body){
    const m=get(id);m.reports.push({id:crypto.randomUUID(),reason:clean(body?.reason,160)||'محتوى غير مناسب',createdAt:new Date().toISOString()});
    await memoryRepository.save();return {ok:true};
  }
  function adminList(){return memoryRepository.all().map(m=>({...publicMemory(m),hidden:Boolean(m.hidden),reportsCount:Array.isArray(m.reports)?m.reports.length:0,comments:m.comments||[],reports:m.reports||[]})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  async function adminUpdate(id,body){
    const m=get(id);
    if(body?.text!==undefined)m.text=clean(body.text,1200);
    if(body?.displayName!==undefined)m.displayName=clean(body.displayName,80)||'مجهول';
    if(body?.hidden!==undefined)m.hidden=Boolean(body.hidden);
    if(body?.pinned!==undefined)m.pinned=Boolean(body.pinned);
    if(body?.clearReports)m.reports=[];
    await memoryRepository.save();return publicMemory(m);
  }
  async function adminDeleteComment(id,commentId){
    const m=get(id),index=(m.comments||[]).findIndex(c=>c.id===commentId);
    if(index<0)throw new MemoryServiceError('Comment not found',404);
    m.comments.splice(index,1);await memoryRepository.save();return {ok:true};
  }
  async function adminDelete(id){
    const m=memoryRepository.removeById(id);
    if(!m)throw new MemoryServiceError('Memory not found',404);
    if(storageReady){if(m.imageKey)void deleteObject(m.imageKey);if(m.videoKey)void deleteObject(m.videoKey);}
    await memoryRepository.save();return {ok:true};
  }

  return {restore,list,upload,create,like,share,comment,report,adminList,adminUpdate,adminDeleteComment,adminDelete};
}
