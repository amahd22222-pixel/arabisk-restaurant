import { sendServiceError } from '../utils/service-error.js';

export function registerMemoriesRoutes(app,{service,requireAdminApiKey,memoryUploadRateLimit,memoryMutationRateLimit}){
  app.get('/api/memories',(req,res)=>{
    try{
      const result=service.list(req.query);
      res.setHeader('X-Memories-Total',String(result.total));
      res.setHeader('X-Memories-Has-More',String(result.hasMore));
      return res.json(result.items);
    }catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories/upload',memoryUploadRateLimit,(req,res)=>{
    try{return res.json(service.upload(req.body||{}));}catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories',memoryMutationRateLimit,async(req,res)=>{
    try{return res.status(201).json(await service.create(req.body||{}));}catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories/:id/like',memoryMutationRateLimit,async(req,res)=>{
    try{return res.json(await service.like(req.params.id));}catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories/:id/share',memoryMutationRateLimit,async(req,res)=>{
    try{return res.json(await service.share(req.params.id));}catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories/:id/comments',memoryMutationRateLimit,async(req,res)=>{
    try{return res.json(await service.comment(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}
  });

  app.post('/api/memories/:id/report',memoryMutationRateLimit,async(req,res)=>{
    try{return res.json(await service.report(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}
  });

  app.get('/api/admin/memories',requireAdminApiKey,(_req,res)=>{
    try{return res.json(service.adminList());}catch(error){return sendServiceError(res,error);}
  });

  app.patch('/api/admin/memories/:id',requireAdminApiKey,async(req,res)=>{
    try{return res.json(await service.adminUpdate(req.params.id,req.body||{}));}catch(error){return sendServiceError(res,error);}
  });

  app.delete('/api/admin/memories/:id/comments/:commentId',requireAdminApiKey,async(req,res)=>{
    try{return res.json(await service.adminDeleteComment(req.params.id,req.params.commentId));}catch(error){return sendServiceError(res,error);}
  });

  app.delete('/api/admin/memories/:id',requireAdminApiKey,async(req,res)=>{
    try{return res.json(await service.adminDelete(req.params.id));}catch(error){return sendServiceError(res,error);}
  });
}
