import express from 'express';
import path from 'node:path';

export function registerPageRoutes(app, { rootDir, distDir }) {
  const page = (file) => path.join(rootDir, file);

  app.get('/cart', (_req, res) => res.sendFile(page('cart-page.html')));
  app.get('/track-order', (_req, res) => res.sendFile(page('order-tracking.html')));
  app.get('/events', (_req, res) => res.sendFile(page('events.html')));
  app.get('/memories', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(page('memories.html'));
  });
  app.get(/^\/events\/[^/]+$/, (_req, res) => res.sendFile(page('event-page.html')));
  app.get('/menu', (_req, res) => res.sendFile(page('menu.html')));
  app.get(/^\/menu\/[^/]+$/, (_req, res) => res.sendFile(page('category-page.html')));
  app.get(/^\/menu\/[^/]+\/[^/]+$/, (_req, res) => res.sendFile(page('product-page.html')));

  app.use(express.static(distDir));

  app.use('/api', (_req, res) => {
    return res.status(404).json({
      code: 'API_ROUTE_NOT_FOUND',
      message: 'API route not found.'
    });
  });

  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
