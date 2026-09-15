import crypto from 'node:crypto';

const STATE_KEY = 'data/arabisk-banner-videos.json';
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);

export function registerBannerVideoRoutes(app, { storageReady, presign, readJson, writeJson, deleteObject }) {
  const videos = [];
  const persist = () => void writeJson(STATE_KEY, videos);

  async function restoreBannerVideos() {
    if (!storageReady) return;
    const saved = await readJson(STATE_KEY, null);
    if (!Array.isArray(saved)) return;
    videos.splice(0, videos.length, ...saved.filter((item) => item && item.bannerId));
  }

  const findVideo = (id) => videos.find((item) => item.bannerId === id);
  const publicVideo = (item) => item ? ({
    bannerId: item.bannerId,
    active: item.active !== false,
    videoUrl: item.videoKey && storageReady ? presign('GET', item.videoKey, 900) : ''
  }) : ({ bannerId: id, active: false, videoUrl: '' });

  app.get('/api/banners/:id/video', (req, res) => {
    const item = findVideo(req.params.id);
    if (!item) return res.json({ bannerId: req.params.id, active: false, videoUrl: '' });
    return res.json(publicVideo(item));
  });

  app.patch('/api/banners/:id/video', (req, res) => {
    const bannerId = cleanText(req.params.id, 40);
    const old = findVideo(bannerId);
    const nextKey = cleanKey(req.body?.videoKey);
    const active = req.body?.active !== undefined ? Boolean(req.body.active) : true;
    if (!nextKey) {
      if (old?.videoKey && storageReady) void deleteObject(old.videoKey);
      const index = videos.findIndex((item) => item.bannerId === bannerId);
      if (index >= 0) videos.splice(index, 1);
      persist();
      return res.json({ bannerId, active: false, videoUrl: '' });
    }
    const item = old || { bannerId, videoKey: '', active: true };
    item.videoKey = nextKey;
    item.active = active;
    if (!old) videos.push(item);
    else if (old.videoKey && old.videoKey !== nextKey && storageReady) void deleteObject(old.videoKey);
    persist();
    return res.json(publicVideo(item));
  });

  app.post('/api/banners/:id/video/presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
    const bannerId = cleanText(req.params.id, 40);
    const fileName = cleanText(req.body?.fileName, 160).replace(/[^a-zA-Z0-9._-]/g, '-');
    const contentType = cleanText(req.body?.contentType, 80).toLowerCase();
    const size = Number(req.body?.size);
    if (!fileName || !VIDEO_TYPES.has(contentType)) return res.status(400).json({ message: 'Only MP4, WebM and MOV videos are supported.' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_VIDEO_BYTES) return res.status(400).json({ message: 'Maximum banner video size is 120 MB.' });
    const key = `banners/${bannerId}/video/${crypto.randomUUID()}-${fileName}`;
    try { return res.json({ key, uploadUrl: presign('PUT', key, 900), expiresIn: 900 }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare banner video upload.' }); }
  });

  app.post('/api/banners/:id/video/delete-presign', (req, res) => {
    if (!storageReady) return res.status(503).json({ message: 'Video storage is not configured on the web service.' });
    const item = findVideo(req.params.id);
    if (!item?.videoKey) return res.json({ url: '', key: '' });
    try { return res.json({ url: presign('DELETE', item.videoKey, 900), key: item.videoKey }); }
    catch (error) { console.error(error); return res.status(503).json({ message: 'Unable to prepare banner video deletion.' }); }
  });

  return restoreBannerVideos;
}
