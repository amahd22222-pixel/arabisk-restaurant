import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const standaloneAssetNames = new Set(['cart.js', 'cart-page.js', 'smart-menu.js', 'product-page.js', 'events.js', 'event-detail.js', 'style.css']);

function standaloneMenuPages() {
  return {
    name: 'arabisk-standalone-menu-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
        const routes = [
          { pattern: /^\/events\/?$/, file: 'events.html' },
          { pattern: /^\/events\/[^/]+\/?$/, file: 'event-page.html' },
          { pattern: /^\/menu\/?$/, file: 'menu.html' },
          { pattern: /^\/menu\/[^/]+\/?$/, file: 'category-page.html' },
          { pattern: /^\/menu\/[^/]+\/[^/]+\/?$/, file: 'product-page.html' }
        ];
        const route = routes.find(item => item.pattern.test(pathname));
        if (!route) return next();
        const filePath = path.join(root, route.file);
        try {
          const html = fs.readFileSync(filePath, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, max-age=0');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
    writeBundle(options) {
      const outDir = options.dir ? path.resolve(options.dir) : path.join(root, 'dist');
      const copyAssets = directory => {
        fs.mkdirSync(directory, { recursive: true });
        for (const fileName of standaloneAssetNames) {
          fs.copyFileSync(path.join(root, fileName), path.join(directory, fileName));
        }
      };

      // Keep root copies available for top-level /menu pages and direct requests.
      copyAssets(outDir);

    }
  };
}

export default defineConfig({ plugins: [standaloneMenuPages()] });
