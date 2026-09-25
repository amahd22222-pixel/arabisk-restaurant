export function registerExperienceRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/experiences',(req,res)=>res.json(service.list(req)));
  app.get('/api/experiences/:slugOrId',(req,res)=>{
    const key=String(req.params.slugOrId||'').trim();
    const data=service.get(key);
    if(data.status!=='published'&&!service.isAdmin(req))return res.status(404).json({message:'Experience not found'});
    return res.json(data);
  });
  app.post('/api/experiences',requireAdminApiKey,async(req,res)=>res.status(201).json(await service.create(req.body||{})));
  app.patch('/api/experiences/:id',requireAdminApiKey,async(req,res)=>res.json(await service.update(req.params.id,req.body||{})));
  app.delete('/api/experiences/:id',requireAdminApiKey,async(req,res)=>res.json(await service.remove(req.params.id,)));
  app.post('/api/experiences/images/presign',requireAdminApiKey,(req,res)=>res.json(service.presignImage(req.body||{})));
  app.post('/api/experiences/videos/presign',requireAdminApiKey,(req,res)=>res.json(service.presignVideo(req.body||{})));
  app.post('/api/experiences/videos/delete-presign',requireAdminApiKey,(req,res)=>res.json(service.presignVideoDelete(req.body||{})));
  app.post('/api/experiences/images/delete-presign',requireAdminApiKey,(req,res)=>res.json(service.presignImageDelete(req.body||{})));
}
