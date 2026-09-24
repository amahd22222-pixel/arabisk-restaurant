const sendServiceError=(res,error)=>res.status(Number(error?.status)||500).json({message:error?.message||'Internal server error'});
export function registerExperienceRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/experiences',(req,res)=>{try{return res.json(service.list(req));}catch(error){return sendServiceError(res,error);}});
  app.get('/api/experiences/:slugOrId',(req,res)=>{try{const key=String(req.params.slugOrId||'').trim();const data=service.get(key);if(data.status!=='published'&&!service.isAdmin(req))return res.status(404).json({message:'Experience not found'});return res.json(data);}catch(error){return sendServiceError(res,error);}});
  app.post('/api/experiences',requireAdminApiKey,async(req,res)=>{try{return res.status(201).json(await service.create(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.patch('/api/experiences/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.update(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.delete('/api/experiences/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.remove(req.params.id));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/experiences/images/presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignImage(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/experiences/videos/presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignVideo(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/experiences/videos/delete-presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignVideoDelete(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/experiences/images/delete-presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignImageDelete(req.body||{}));}catch(error){return sendServiceError(res,error);}});
}