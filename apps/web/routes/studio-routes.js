export function registerStudioRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/studio/shows',(req,res)=>res.json(service.list(req.query)));
  app.get('/api/studio/shows/:id',(req,res)=>res.json(service.get(req.params.id)));
  app.post('/api/studio/shows',requireAdminApiKey,async(req,res)=>res.status(201).json(await service.create(req.body||{})));
  app.patch('/api/studio/shows/:id',requireAdminApiKey,async(req,res)=>res.json(await service.update(req.params.id,req.body||{})));
  app.delete('/api/studio/shows/:id',requireAdminApiKey,async(req,res)=>res.json(await service.remove(req.params.id)));
  app.post('/api/studio/shows/:id/media/presign',requireAdminApiKey,(req,res)=>res.json(service.presignMedia(req.params.id,req.body||{})));
  app.post('/api/studio/shows/:id/media/delete-presign',requireAdminApiKey,(req,res)=>res.json(service.presignDelete(req.params.id,req.body||{})));
}
