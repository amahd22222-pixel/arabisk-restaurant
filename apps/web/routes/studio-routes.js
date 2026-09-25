import { sendServiceError } from '../utils/service-error.js';
export function registerStudioRoutes(app,{service,requireAdminApiKey}){
  app.get('/api/studio/shows',(req,res)=>{try{return res.json(service.list(req.query));}catch(error){return sendServiceError(res,error);}});
  app.get('/api/studio/shows/:id',(req,res)=>{try{return res.json(service.get(req.params.id));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/studio/shows',requireAdminApiKey,async(req,res)=>{try{return res.status(201).json(await service.create(req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.patch('/api/studio/shows/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.update(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.delete('/api/studio/shows/:id',requireAdminApiKey,async(req,res)=>{try{return res.json(await service.remove(req.params.id));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/studio/shows/:id/media/presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignMedia(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}});
  app.post('/api/studio/shows/:id/media/delete-presign',requireAdminApiKey,(req,res)=>{try{return res.json(service.presignDelete(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}});
}