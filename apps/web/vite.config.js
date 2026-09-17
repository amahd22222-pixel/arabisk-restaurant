import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const standaloneAssetNames = new Set(['cart.js', 'smart-menu.js', 'product-page.js']);
const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function standaloneMenuPages() {
  return {
    name: 'arabisk-standalone-menu-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
        const assetMatch = pathname.match(/^\/menu\/[^/]+(?:\/[^/]+)?\/(cart|smart-menu|product-page)\.js$/);
        if (assetMatch) {
          const fileName = `${assetMatch[1]}.js`;
          try {
            const filePath = path.join(root, fileName);
            const content = fs.readFileSync(filePath, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.end(content);
          } catch (error) {
            next(error);
          }
          return;
        }

        const routes = [
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

      // Category assets support /menu/<category>/... routes.
      const categoryIds = ['Breakfast','Manakish','Cold Appetizers','Hot Appetizers','Salads','Soups','Sandwich','Pizza','Pasta','Main Course','Mixed Grill','Mixed Taste','Desserts','Cheese Cake','Arabisk Ice Cream','Cocktail & Refreshing Drinks','Energy Drinks','Juices','Mojitos','Milk Shakes','Tea','Coffee','Latte','Soft Drinks','Drinking Water','Sheesha'];
      for (const categoryId of categoryIds) copyAssets(path.join(outDir, 'menu', slug(categoryId)));

      // Product pages use relative ./<asset>.js URLs. Create the same assets
      // beside every known product route so production does not fall through
      // to index.html with a misleading HTTP 200 response.
      const source = fs.readFileSync(path.join(root, 'menu-data.js'), 'utf8');
      const categoryBlock = /'([^']+)'\s*:\s*\[([\s\S]*?)\](?=,\n\s*'[^']+'\s*:|\n\};)/g;
      let categoryMatch;
      while ((categoryMatch = categoryBlock.exec(source))) {
        const categoryId = categoryMatch[1];
        const block = categoryMatch[2];
        const productName = /\['[^']*'\s*,\s*'([^']+)'\s*,/g;
        let productMatch;
        while ((productMatch = productName.exec(block))) {
          copyAssets(path.join(outDir, 'menu', slug(categoryId), slug(productMatch[1])));
        }
      }
    }
  };
}

export default defineConfig({ plugins: [standaloneMenuPages()] });
