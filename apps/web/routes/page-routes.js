import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

const injectMobileNavigation = async (filePath, res) => {
  const html = await fs.readFile(filePath, 'utf8');
  const assets = '<link rel="stylesheet" href="/mobile-nav.css">\n<script type="module" src="/mobile-nav.js"></script>';
  res.type('html').send(html.replace('</head>', `${assets}\n</head>`));
};

export function registerPageRoutes(app, { rootDir, distDir }) {
  const page = (file) => path.join(rootDir, file);

  app.get('/cart', async (_req, res, next) => { try { await injectMobileNavigation(page('cart-page.html'), res); } catch (error) { next(error); } });
  app.get('/track-order', async (_req, res, next) => { try { await injectMobileNavigation(page('order-tracking.html'), res); } catch (error) { next(error); } });
  app.get('/events', async (_req, res, next) => { try { await injectMobileNavigation(page('events.html'), res); } catch (error) { next(error); } });
  app.get('/memories', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    void injectMobileNavigation(page('memories.html'), res).catch(next);
  });
  app.get(/^\/events\/[^/]+$/, async (_req, res, next) => { try { await injectMobileNavigation(page('event-page.html'), res); } catch (error) { next(error); } });
  app.get('/menu', async (_req, res, next) => { try { await injectMobileNavigation(page('menu.html'), res); } catch (error) { next(error); } });
  app.get(/^\/menu\/[^/]+$/, async (_req, res, next) => { try { await injectMobileNavigation(page('category-page.html'), res); } catch (error) { next(error); } });
  app.get(/^\/menu\/[^/]+\/[^/]+$/, async (_req, res, next) => { try { await injectMobileNavigation(page('product-page.html'), res); } catch (error) { next(error); } });

  app.use(express.static(distDir));

  app.use('/api', (_req, res) => {
    return res.status(404).json({
      code: 'API_ROUTE_NOT_FOUND',
      message: 'API route not found.'
    });
  });

  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
