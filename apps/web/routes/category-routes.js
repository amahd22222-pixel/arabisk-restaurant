export function registerCategoryRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/categories',(req,res)=>res.json(service.list(req)));
  app.post('/api/categories',requireAdminApiKey,async(req,res)=>res.status(201).json(await service.create(req.body||{})));
  app.patch('/api/categories/:id',requireAdminApiKey,async(req,res)=>res.json(await service.update(req.params.id,req.body||{})));
  app.delete('/api/categories/:id',requireAdminApiKey,async(req,res)=>res.json(await service.remove(req.params.id)));
  app.post('/api/categories/images/presign',requireAdminApiKey,(req,res)=>res.json(service.presignImage(req.body||{})));
  app.post('/api/categories/images/delete-presign',requireAdminApiKey,(req,res)=>res.json(service.presignImageDelete(req.body||{})));
}
