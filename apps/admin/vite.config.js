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
  }
});
