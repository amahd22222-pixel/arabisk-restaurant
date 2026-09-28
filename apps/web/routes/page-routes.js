import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

const injectMobileNavigation = async (filePath, res) => {
  let html = await fs.readFile(filePath, 'utf8');
  html = html.replace(
    /<meta name="viewport" content="([^"]*)">/i,
    (_match, content) => `<meta name="viewport" content="${content.includes('viewport-fit=cover') ? content : content + ',viewport-fit=cover'}">`
  );
  const assets = [
    !html.includes('name="theme-color"') ? '<meta name="theme-color" content="#17130f">' : '',
    !html.includes('name="mobile-web-app-capable"') ? '<meta name="mobile-web-app-capable" content="yes">' : '',
    !html.includes('name="apple-mobile-web-app-capable"') ? '<meta name="apple-mobile-web-app-capable" content="yes">' : '',
    !html.includes('name="apple-mobile-web-app-status-bar-style"') ? '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' : '',
    !html.includes('name="apple-mobile-web-app-title"') ? '<meta name="apple-mobile-web-app-title" content="ARABISK">' : '',
    !html.includes('rel="manifest"') ? '<link rel="manifest" href="/manifest.json">' : '',
    !html.includes('href="/icons/icon.svg"') ? '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">' : '',
    !html.includes('href="/icons/icon-192.png"') ? '<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">' : '',
    !html.includes('href="/icons/apple-touch-icon.png"') ? '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">' : '',
    !html.includes('href="/mobile-nav.css"') ? '<link rel="stylesheet" href="/mobile-nav.css">' : '',
    !html.includes('src="/mobile-nav.js"') ? '<script type="module" src="/mobile-nav.js"></script>' : '',
    !html.includes('href="/shams.css"') ? '<link rel="stylesheet" href="/shams.css">' : '',
    !html.includes('src="/shams.js"') ? '<script type="module" src="/shams.js"></script>' : '',
    !html.includes('src="/pwa-ui.js"') ? '<script type="module" src="/pwa-ui.js"></script>' : '',
    !html.includes('src="/pwa-register.js"') ? '<script type="module" src="/pwa-register.js"></script>' : '',
    !html.includes('src="/pwa-profile.js"') ? '<script type="module" src="/pwa-profile.js"></script>' : '',
    !html.includes('src="/pwa-notifications.js"') ? '<script type="module" src="/pwa-notifications.js"></script>' : '',
    !html.includes('src="/pwa-network.js"') ? '<script type="module" src="/pwa-network.js"></script>' : '',
    !html.includes('src="/pwa-media.js"') ? '<script type="module" src="/pwa-media.js"></script>' : ''
  ].filter(Boolean).join('\n');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.type('html').send(html.replace('</head>', `${assets}\n</head>`));
};

export function registerPageRoutes(app, { rootDir, distDir }) {
  const page = (file) => path.join(rootDir, file);

  app.get('/profile-page.css', async (_req, res, next) => { try {
    const css = await fs.readFile(page('profile-page.css'), 'utf8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('css').send(css);
  } catch (error) { next(error); } });

  app.get('/profile-page.js', async (_req, res, next) => { try {
    const script = await fs.readFile(page('profile-page.js'), 'utf8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('application/javascript').send(script);
  } catch (error) { next(error); } });

  app.get('/privacy', async (_req, res, next) => { try {
    await injectMobileNavigation(page('privacy.html'), res);
  } catch (error) { next(error); } });
  app.get('/cart', async (_req, res, next) => { try { await injectMobileNavigation(page('cart-page.html'), res); } catch (error) { next(error); } });
  app.get('/profile', async (_req, res, next) => { try { await injectMobileNavigation(page('profile.html'), res); } catch (error) { next(error); } });
  app.get('/track-order', async (_req, res, next) => { try { await injectMobileNavigation(page('order-tracking.html'), res); } catch (error) { next(error); } });
  app.get('/events', async (_req, res, next) => { try { await injectMobileNavigation(page('events.html'), res); } catch (error) { next(error); } });
  app.get('/offers', async (_req, res, next) => { try { await injectMobileNavigation(page('offers.html'), res); } catch (error) { next(error); } });
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

  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      const filename = normalized.split('/').pop() || '';
      const noCacheFiles = new Set([
        'index.html',
        'sw.js',
        'pwa-register.js',
        'pwa-ui.js',
        'pwa-profile.js',
        'pwa-notifications.js',
        'pwa-network.js',
        'pwa-media.js',
        'shams.js',
        'shams.css',
        'mobile-nav.js',
        'mobile-nav.css',
        'profile-page.css',
        'profile-page.js',
        'manifest.json'
      ]);
      if (noCacheFiles.has(filename)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  app.use('/api', (_req, res) => {
    return res.status(404).json({
      code: 'API_ROUTE_NOT_FOUND',
      message: 'API route not found.'
    });
  });

  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
