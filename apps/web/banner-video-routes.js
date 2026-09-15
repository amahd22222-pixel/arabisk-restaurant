import crypto from 'node:crypto';

const STATE_KEY = 'data/arabisk-banner-videos.json';
const STUDIO_STATE_KEY = 'data/arabisk-studio.json';
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);

export function registerBannerVideoRoutes(app, { storageReady, presign, readJson, writeJson, deleteObject }) {
  const videos = [];
  const studio = [];
  const persist = () => void writeJson(STATE_KEY, videos);
  const persistStudio = () => void writeJson(STUDIO_STATE_KEY, studio);

  async function restoreBannerVideos() {
    if (!storageReady) return;
    const saved = await readJson(STATE_KEY, null);
    if (!Array.isArray(saved)) return;
    videos.splice(0, videos.length, ...saved.filter((item) => item && item.bannerId));
  }
  async function restoreStudio() {
    if (!storageReady) return;
    const saved = await readJson(STUDIO_STATE_KEY, null);
    if (!Array.isArray(saved)) return;
    studio.splice(0, studio.length, ...saved.filter((item) => item && item.id));
  }

  const findVideo = (id) => videos.find((item) => item.bannerId === id);
  const publicVideo = (id) => {
    const item = findVideo(id);
    return item ? { bannerId:id, active:item.active !== false, videoUrl:item.videoKey && storageReady ? presign('GET', item.videoKey, 900) : '', mobileVideoUrl:item.mobileVideoKey && storageReady ? presign('GET', item.mobileVideoKey, 900) : '' } : { bannerId:id, active:false, videoUrl:'', mobileVideoUrl:'' };
  };

  app.get('/api/banners/:id/video', (req, res) => res.json(publicVideo(req.params.id)));
  app.patch('/api/banners/:id/video', async (req, res) => {
    const bannerId = cleanText(req.params.id, 40);
    const old = findVideo(bannerId);
    const hasDesktop = Object.prototype.hasOwnProperty.call(req.body || {}, 'videoKey');
    const hasMobile = Object.prototype.hasOwnProperty.call(req.body || {}, 'mobileVideoKey');
    const oldDesktop = old?.videoKey || '';
    const oldMobile = old?.mobileVideoKey || '';
    const nextDesktop = hasDesktop ? cleanKey(req.body?.videoKey) : oldDesktop;
    const nextMobile = hasMobile ? cleanKey(req.body?.mobileVideoKey) : oldMobile;
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : (old?.active !== false);
    if (!old && !hasDesktop && !hasMobile) return res.json(publicVideo(bannerId));
    if (storageReady && hasDesktop && oldDesktop && oldDesktop !== nextDesktop) await deleteObject(oldDesktop);
    if (storageReady && hasMobile && oldMobile && oldMobile !== nextMobile) await deleteObject(oldMobile);
    if (!nextDesktop && !nextMobile) {
      const index = videos.findIndex((item) => item.bannerId === bannerId);
      if (index >= 0) videos.splice(index, 1);
      persist();
      return res.json(publicVideo(bannerId));
    }
    const item = old || { bannerId, videoKey:'', mobileVideoKey:'', active:true };
    item.videoKey = nextDesktop; item.mobileVideoKey = nextMobile; item.active = active;
    if (!old) videos.push(item);
    persist(); return res.json(publicVideo(bannerId));
  });
  app.post('/api/banners/:id/video/presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message:'Video storage is not configured on the web service.' });
    const bannerId = cleanText(req.params.id, 40);
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
    const size = Number(req.body?.size);
    if (!fileName || !VIDEO_TYPES.has(contentType)) return res.status(400).json({ message:'Only MP4, WebM and MOV videos are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_VIDEO_BYTES) return res.status(400).json({ message:'Maximum banner video size is 120 MB.' });
    const key = `banners/${bannerId}/video/${slot}/${crypto.randomUUID()}-${fileName}`;
    try { return res.json({ key, uploadUrl:presign('PUT', key, 900), expiresIn:900 }); } catch (error) { console.error(error); return res.status(503).json({ message:'Unable to prepare banner video upload.' }); }
  });
  app.post('/api/banners/:id/video/delete-presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message:'Video storage is not configured on the web service.' });
    const item = findVideo(req.params.id);
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const key = slot === 'mobile' ? item?.mobileVideoKey : item?.videoKey;
    if (!key) return res.json({ url:'', key:'' });
    try { return res.json({ url:presign('DELETE', key, 900), key }); } catch (error) { console.error(error); return res.status(503).json({ message:'Unable to prepare banner video deletion.' }); }
  });

  const nextStudioId = () => {
    const max = studio.reduce((highest, item) => { const match = String(item.id || '').match(/^S(\d+)$/); return Math.max(highest, match ? Number(match[1]) : 0); }, 0);
    return `S${String(max + 1).padStart(3, '0')}`;
  };
  const publicStudio = (item) => item ? {
    id:item.id, title:item.title || '', active:item.active !== false, sortOrder:Number(item.sortOrder) || 1,
    desktopVideoUrl:item.desktopVideoKey && storageReady ? presign('GET', item.desktopVideoKey, 900) : '',
    mobileVideoUrl:item.mobileVideoKey && storageReady ? presign('GET', item.mobileVideoKey, 900) : ''
  } : null;
  const getStudio = (id) => studio.find((item) => item.id === id);

  app.get('/api/studio/shows', (req, res) => {
    const onlyActive = String(req.query?.active ?? 'false') === 'true';
    const items = studio.filter((item) => !onlyActive || item.active !== false).slice().sort((a,b) => Number(a.sortOrder||0) - Number(b.sortOrder||0));
    return res.json(items.map(publicStudio));
  });
  app.get('/api/studio/shows/:id', (req, res) => {
    const item = getStudio(req.params.id);
    if (!item) return res.status(404).json({ message:'Studio show not found' });
    return res.json(publicStudio(item));
  });
  app.post('/api/studio/shows', (req, res) => {
    const b = req.body || {};
    const item = { id:nextStudioId(), title:cleanText(b.title,120), active:b.active !== undefined ? Boolean(b.active) : true, sortOrder:Number.isFinite(Number(b.sortOrder)) ? Math.max(1, Number(b.sortOrder)) : studio.length + 1, desktopVideoKey:'', mobileVideoKey:'', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    studio.push(item); persistStudio(); return res.status(201).json(publicStudio(item));
  });
  app.patch('/api/studio/shows/:id', async (req, res) => {
    const item = getStudio(req.params.id);
    if (!item) return res.status(404).json({ message:'Studio show not found' });
    const b = req.body || {};
    const hasDesktop = Object.prototype.hasOwnProperty.call(b, 'desktopVideoKey');
    const hasMobile = Object.prototype.hasOwnProperty.call(b, 'mobileVideoKey');
    const nextDesktop = hasDesktop ? cleanKey(b.desktopVideoKey) : (item.desktopVideoKey || '');
    const nextMobile = hasMobile ? cleanKey(b.mobileVideoKey) : (item.mobileVideoKey || '');
    if (b.title !== undefined) item.title = cleanText(b.title,120);
    if (b.active !== undefined) item.active = Boolean(b.active);
    if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) item.sortOrder = Math.max(1, Number(b.sortOrder));
    if (hasDesktop && item.desktopVideoKey && item.desktopVideoKey !== nextDesktop && storageReady) await deleteObject(item.desktopVideoKey);
    if (hasMobile && item.mobileVideoKey && item.mobileVideoKey !== nextMobile && storageReady) await deleteObject(item.mobileVideoKey);
    item.desktopVideoKey = nextDesktop; item.mobileVideoKey = nextMobile; item.updatedAt = new Date().toISOString();
    persistStudio(); return res.json(publicStudio(item));
  });
  app.delete('/api/studio/shows/:id', async (req, res) => {
    const index = studio.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ message:'Studio show not found' });
    const [item] = studio.splice(index,1);
    if (storageReady && item.desktopVideoKey) await deleteObject(item.desktopVideoKey);
    if (storageReady && item.mobileVideoKey) await deleteObject(item.mobileVideoKey);
    studio.forEach((entry,idx) => { entry.sortOrder = idx + 1; });
    persistStudio(); return res.json({ ok:true, removed:item });
  });
  app.post('/api/studio/shows/:id/media/presign', (req,res) => {
    if (!storageReady) return res.status(503).json({ message:'Video storage is not configured on the web service.' });
    const item = getStudio(req.params.id);
    if (!item) return res.status(404).json({ message:'Studio show not found' });
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const fileName = cleanText(req.body?.fileName,160).replace(/[^a-zA-Z0-9._-]/g,'-');
    const contentType = cleanText(req.body?.contentType,80).toLowerCase();
    const size = Number(req.body?.size);
    if (!fileName || !VIDEO_TYPES.has(contentType)) return res.status(400).json({ message:'Only MP4, WebM and MOV videos are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_VIDEO_BYTES) return res.status(400).json({ message:'Maximum Studio video size is 120 MB.' });
    const key = `studio/${item.id}/${slot}/${crypto.randomUUID()}-${fileName}`;
    try { return res.json({ key, uploadUrl:presign('PUT',key,900), expiresIn:900 }); } catch(error) { console.error(error); return res.status(503).json({ message:'Unable to prepare Studio upload.' }); }
  });
  app.post('/api/studio/shows/:id/media/delete-presign', (req,res) => {
    if (!storageReady) return res.status(503).json({ message:'Video storage is not configured on the web service.' });
    const item = getStudio(req.params.id);
    if (!item) return res.status(404).json({ message:'Studio show not found' });
    const slot = req.body?.slot === 'mobile' ? 'mobile' : 'desktop';
    const key = slot === 'mobile' ? item.mobileVideoKey : item.desktopVideoKey;
    if (!key) return res.json({ url:'', key:'' });
    try { return res.json({ url:presign('DELETE',key,900), key }); } catch(error) { console.error(error); return res.status(503).json({ message:'Unable to prepare Studio deletion.' }); }
  });

  return async () => {
    await restoreBannerVideos();
    await restoreStudio();
  };
}
