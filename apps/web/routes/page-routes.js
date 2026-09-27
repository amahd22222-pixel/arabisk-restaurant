import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

const injectMobileNavigation = async (filePath, res) => {
  const html = await fs.readFile(filePath, 'utf8');
  const assets = `<meta name="theme-color" content="#17130f">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ARABISK">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/mobile-nav.css">
<script type="module" src="/mobile-nav.js"></script>
<script type="module" src="/pwa-ui.js"></script>
<script type="module" src="/pwa-register.js"></script>
<script type="module" src="/pwa-profile.js"></script>
<script type="module" src="/pwa-notifications.js"></script>`;
  res.type('html').send(html.replace('</head>', `${assets}\n</head>`));
};

export function registerPageRoutes(app, { rootDir, distDir }) {
  const page = (file) => path.join(rootDir, file);

  app.get('/privacy', async (_req, res, next) => { try {
    const html = await fs.readFile(page('privacy.html'), 'utf8');
    res.type('html').send(html);
  } catch (error) { next(error); } });
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
