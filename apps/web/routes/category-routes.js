const sendServiceError=(res,error)=>res.status(Number(error?.status)||500).json({message:error?.message||'Internal server error'});
export function registerCategoryRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/categories',(req,res)=>{try{return res.json(service.list(req));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/categories',requireAdminApiKey,async(req,res)=>{try{return res.status(201).json(await service.create(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.patch('/api/categories/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.update(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.delete('/api/categories/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.remove(req.params.id));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/categories/images/presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignImage(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/categories/images/delete-presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignImageDelete(req.body||{}));}catch(error){return sendServiceError(res,error);}});
}