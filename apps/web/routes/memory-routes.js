export function registerMemoriesRoutes(app,{service,requireAdminApiKey,memoryUploadRateLimit,memoryMutationRateLimit}){
  app.get('/api/memories',(req,res)=>{
    const result=service.list(req.query);
    res.setHeader('X-Memories-Total',String(result.total));
    res.setHeader('X-Memories-Has-More',String(result.hasMore));
    return res.json(result.items);
  });

  app.post('/api/memories/upload',memoryUploadRateLimit,(req,res)=>res.json(service.upload(req.body||{})));

  app.post('/api/memories',memoryMutationRateLimit,async(req,res)=>res.status(201).json(await service.create(req.body||{})));

  app.post('/api/memories/:id/like',memoryMutationRateLimit,async(req,res)=>res.json(await service.like(req.params.id)));

  app.post('/api/memories/:id/share',memoryMutationRateLimit,async(req,res)=>res.json(await service.share(req.params.id)));

  app.post('/api/memories/:id/comments',memoryMutationRateLimit,async(req,res)=>res.json(await service.comment(req.params.id,req.body||{})));

  app.post('/api/memories/:id/report',memoryMutationRateLimit,async(req,res)=>res.json(await service.report(req.params.id,req.body||{})));

  app.get('/api/admin/memories',requireAdminApiKey,(_req,res)=>res.json(service.adminList()));

  app.patch('/api/admin/memories/:id',requireAdminApiKey,async(req,res)=>res.json(await service.adminUpdate(req.params.id,req.body||{})));

  app.delete('/api/admin/memories/:id/comments/:commentId',requireAdminApiKey,async(req,res)=>res.json(await service.adminDeleteComment(req.params.id,req.params.commentId)));

  app.delete('/api/admin/memories/:id',requireAdminApiKey,async(req,res)=>res.json(await service.adminDelete(req.params.id)));
}
