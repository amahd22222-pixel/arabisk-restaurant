import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const standaloneAssetNames = new Set(['cart.js', 'smart-menu.js', 'product-details-client.js']);
const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function standaloneMenuPages() {
  return {
    name: 'arabisk-standalone-menu-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
        const match = pathname.match(/^\/menu\/[^/]+(?:\/[^/]+)?\/(cart|smart-menu|product-details-client)\.js$/);
        if (!match) return next();
        const fileName = `${match[1]}.js`;
        if (!standaloneAssetNames.has(fileName)) return next();
        try {
          const filePath = path.join(root, fileName);
          const content = fs.readFileSync(filePath, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(content);
        } catch (error) {
          next(error);
        }
      });

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
    },
    writeBundle(options) {
      const outDir = options.dir ? path.resolve(options.dir) : path.join(root, 'dist');
      const categoryIds = ['Breakfast','Manakish','Cold Appetizers','Hot Appetizers','Salads','Soups','Sandwich','Pizza','Pasta','Main Course','Mixed Grill','Mixed Taste','Desserts','Cheese Cake','Arabisk Ice Cream','Cocktail & Refreshing Drinks','Energy Drinks','Juices','Mojitos','Milk Shakes','Tea','Coffee','Latte','Soft Drinks','Drinking Water','Sheesha'];
      for (const categoryId of categoryIds) {
        const directory = path.join(outDir, 'menu', slug(categoryId));
        fs.mkdirSync(directory, { recursive: true });
        for (const fileName of standaloneAssetNames) fs.copyFileSync(path.join(root, fileName), path.join(directory, fileName));
      }
    }
  };
}

export default defineConfig({ plugins: [standaloneMenuPages()] });
