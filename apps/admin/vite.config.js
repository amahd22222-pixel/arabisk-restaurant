import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(root, 'login.html'),
        dashboard: resolve(root, 'dashboard.html')
      }
    }
  },
  plugins: [{
    name: 'arabisk-admin-intelligence-injection',
    transformIndexHtml(html) {
      if (!html.includes('id="revenue"')) return html;
      return {
        html,
        tags: [
          { tag: 'link', attrs: { rel: 'stylesheet', href: '/revenue-command-center.css' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'stylesheet', href: '/customer-intelligence.css' }, injectTo: 'head' },
          { tag: 'script', attrs: { type: 'module', src: '/revenue-command-center.js' }, injectTo: 'body' },
          { tag: 'script', attrs: { type: 'module', src: '/customer-intelligence.js' }, injectTo: 'body' }
        ]
      };
    }
  }]
});
