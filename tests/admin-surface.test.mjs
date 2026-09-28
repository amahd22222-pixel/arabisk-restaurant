import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('admin dashboard has its required render helpers', () => {
  const source = fs.readFileSync(path.join(root, 'apps/admin/app.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'apps/admin/dashboard.html'), 'utf8');

  for (const helper of ['escapeHtml', 'categoryName', 'orderStatusLabel', 'statusClass']) {
    assert.match(source, new RegExp(`(?:function|const)\\s+${helper}\\b`), `missing ${helper}`);
  }
  for (const id of ['connection', 'error', 'products-body', 'categories-body', 'experiences-body', 'memories-body']) {
    assert.match(dashboard, new RegExp(`\\bid=["']${id}["']`), `missing ${id}`);
  }
});

test('admin production routing separates private upstream from public website URL', () => {
  const script = `
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_PROJECT_ID = 'ci-project';
    process.env.ARABISK_WEB_API_URL = 'https://public.example';
    process.env.ARABISK_WEB_API_PRIVATE_DOMAIN = 'web.internal';
    process.env.ARABISK_WEB_API_PRIVATE_PORT = '8080';
    const config = await import('./apps/admin/config.js?test=' + Date.now());
    console.log(JSON.stringify({ webApiBase: config.webApiBase, publicWebBase: config.publicWebBase }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
  assert.deepEqual(JSON.parse(output), {
    webApiBase: 'http://web.internal:8080',
    publicWebBase: 'https://public.example'
  });
});
