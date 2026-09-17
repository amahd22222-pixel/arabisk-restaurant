import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

function standaloneMenuPages() {
  return {
    name: 'arabisk-standalone-menu-pages',
    configureServer(server) {
      const routes = [
        { pattern: /^\/menu\/?$/, file: 'menu.html' },
        { pattern: /^\/menu\/[^/]+\/?$/, file: 'category-page.html' },
        { pattern: /^\/menu\/[^/]+\/[^/]+\/?$/, file: 'product-page.html' }
      ];
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '/').split('?')[0];
        const route = routes.find(item => item.pattern.test(pathname));
        if (!route) return next();
        const filePath = path.join(root, route.file);
        try {
          const html = fs.readFileSync(filePath, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    }
  };
}

export default defineConfig({ plugins: [standaloneMenuPages()] });
