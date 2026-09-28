import { createProductService } from '../services/product-service.js';

export function registerProductRoutes(app, dependencies) {
  const service = createProductService(dependencies);
  app.get('/api/products', service.list);
  app.get('/api/products/:id', service.get);
  app.post('/api/products', dependencies.requireAdminApiKey, service.create);
  app.patch('/api/products/:id', dependencies.requireAdminApiKey, service.update);
  app.delete('/api/products/:id', dependencies.requireAdminApiKey, service.remove);
  app.post('/api/videos/presign', dependencies.requireAdminApiKey, service.presignVideo);
  app.post('/api/videos/delete-presign', dependencies.requireAdminApiKey, service.deleteVideoPresign);
}
