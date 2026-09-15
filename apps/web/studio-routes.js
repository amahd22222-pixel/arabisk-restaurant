import crypto from 'node:crypto';

const STUDIO_STATE_KEY = 'data/arabisk-studio.json';
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);

export function registerStudioRoutes(app, { storageReady, presign, readJson, writeJson, deleteObject }) {
  const studio = [];
  const persist = () => void writeJson(STUDIO_STATE_KEY, studio);
  const restoreStudio = async () => {
    if (!storageReady) return;
    const saved = await readJson(STUDIO_STATE_KEY, null);
    if (Array.isArray(saved)) studio.splice(0, studio.length, ...saved.filter((item) => item && item.id));
  };
  const get = (id) => studio.find((item) => item.id === id);
  const nextId = () => {
    const max = studio.reduce((n, item) => { const m = String(item.id || '').match(/^S(\d+)$/); return Math.max(n, m ? Number(m[1]) : 0); }, 0);
    return `S${String(max + 1).padStart(3, '0')}`;
  };
  const publicShow = (item) => item ? {
    id: item.id,
    title: item.title || '',
    active: item.active !== false,
    sortOrder: Number(item.sortOrder) || 1,
    placementType: item.placementType || 'home',
    categoryId: item.categoryId || '',
    desktopVideoUrl: item.desktopVideoKey && storageReady ? presign('GET', item.desktopVideoKey, 900) : '',
    mobileVideoUrl: item.mobileVideoKey && storageReady ? presign('GET', item.mobileVideoKey, 900) : ''
  } : null;

  app.get('/api/studio/shows', (req, res) => {
    const onlyActive = String(req.query?.active ?? 'false') === 'true';
    const items = studio.filter((x) => !onlyActive || x.active !== false).slice().sort((a,b) => Number(a.sortOrder||0)-Number(b.sortOrder||0));
    res.json(items.map(publicShow));
  });
  app.get('/api/studio/shows/:id', (req,res) => {
    const item = get(req.params.id); if (!item) return res.status(404).json({message:'Studio show not found'}); return res.json(publicShow(item));
  });
  app.post('/api/studio/shows', (req,res) => {
    const b=req.body||{};
    const item={id:nextId(),title:cleanText(b.title,120),placementType:['home','category'].includes(b.placementType)?b.placementType:'home',categoryId:cleanText(b.categoryId,80),active:b.active!==undefined?Boolean(b.active):true,sortOrder:Number.isFinite(Number(b.sortOrder))?Math.max(1,Number(b.sortOrder)):studio.length+1,desktopVideoKey:'',mobileVideoKey:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(item.placementType==='category'&&!item.categoryId) return res.status(400).json({message:'categoryId is required for category placement'});
    studio.push(item); persist(); return res.status(201).json(publicShow(item));
  });
  app.patch('/api/studio/shows/:id', async (req,res) => {
    const item=get(req.params.id); if(!item) return res.status(404).json({message:'Studio show not found'});
    const b=req.body||{}; const hasD=Object.prototype.hasOwnProperty.call(b,'desktopVideoKey'); const hasM=Object.prototype.hasOwnProperty.call(b,'mobileVideoKey');
    const nextD=hasD?cleanKey(b.desktopVideoKey):(item.desktopVideoKey||''); const nextM=hasM?cleanKey(b.mobileVideoKey):(item.mobileVideoKey||'');
    if(b.title!==undefined)item.title=cleanText(b.title,120);
    if(b.placementType!==undefined){ if(!['home','category'].includes(b.placementType)) return res.status(400).json({message:'Invalid placementType'}); item.placementType=b.placementType; }
    if(b.categoryId!==undefined)item.categoryId=cleanText(b.categoryId,80);
    if(item.placementType==='category'&&!item.categoryId)return res.status(400).json({message:'categoryId is required for category placement'});
    if(b.active!==undefined)item.active=Boolean(b.active);
    if(b.sortOrder!==undefined&&Number.isFinite(Number(b.sortOrder)))item.sortOrder=Math.max(1,Number(b.sortOrder));
    if(hasD&&item.desktopVideoKey&&item.desktopVideoKey!==nextD&&storageReady)await deleteObject(item.desktopVideoKey);
    if(hasM&&item.mobileVideoKey&&item.mobileVideoKey!==nextM&&storageReady)await deleteObject(item.mobileVideoKey);
    item.desktopVideoKey=nextD; item.mobileVideoKey=nextM; item.updatedAt=new Date().toISOString(); persist(); return res.json(publicShow(item));
  });
  app.delete('/api/studio/shows/:id', async (req,res) => {
    const i=studio.findIndex((x)=>x.id===req.params.id); if(i<0)return res.status(404).json({message:'Studio show not found'});
    const [item]=studio.splice(i,1); if(storageReady&&item.desktopVideoKey)await deleteObject(item.desktopVideoKey); if(storageReady&&item.mobileVideoKey)await deleteObject(item.mobileVideoKey); studio.forEach((x,n)=>x.sortOrder=n+1); persist(); return res.json({ok:true,removed:item});
  });
  app.post('/api/studio/shows/:id/media/presign',(req,res)=>{
    if(!storageReady)return res.status(503).json({message:'Video storage is not configured on the web service.'});
    const item=get(req.params.id); if(!item)return res.status(404).json({message:'Studio show not found'});
    const slot=req.body?.slot==='mobile'?'mobile':'desktop'; const fileName=cleanText(req.body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-'); const contentType=cleanText(req.body?.contentType,80).toLowerCase(); const size=Number(req.body?.size);
    if(!fileName||!VIDEO_TYPES.has(contentType))return res.status(400).json({message:'Only MP4, WebM and MOV videos are supported.'});
    if(!Number.isFinite(size)||size<1||size>MAX_VIDEO_BYTES)return res.status(400).json({message:'Maximum Studio video size is 120 MB.'});
    const key=`studio/${item.id}/${slot}/${crypto.randomUUID()}-${fileName}`; try{return res.json({key,uploadUrl:presign('PUT',key,900),expiresIn:900});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare Studio upload.'});}
  });
  app.post('/api/studio/shows/:id/media/delete-presign',(req,res)=>{
    if(!storageReady)return res.status(503).json({message:'Video storage is not configured on the web service.'});
    const item=get(req.params.id); if(!item)return res.status(404).json({message:'Studio show not found'}); const slot=req.body?.slot==='mobile'?'mobile':'desktop'; const key=slot==='mobile'?item.mobileVideoKey:item.desktopVideoKey; if(!key)return res.json({url:'',key:''});
    try{return res.json({url:presign('DELETE',key,900),key});}catch(error){console.error(error);return res.status(503).json({message:'Unable to prepare Studio deletion.'});}
  });
  return restoreStudio;
}
