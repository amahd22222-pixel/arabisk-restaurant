import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['node_modules','.git','dist']);
const suspicious = /(?:^|[-_.])(old|copy|backup|bak|final|v\d+)(?:[-_.]|$)/i;
const duplicates = new Map();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full).replaceAll(path.sep, '/');
      const base = path.basename(rel).replace(/\.[^.]+$/, '').toLowerCase();
      const ext = path.extname(rel).toLowerCase();
      const key = base + ext;
      if (!duplicates.has(key)) duplicates.set(key, []);
      duplicates.get(key).push(rel);
      if (suspicious.test(path.basename(rel))) {
        console.error(`[architecture] suspicious filename: ${rel}`);
        process.exitCode = 1;
      }
    }
  }
}

walk(root);
for (const [key, files] of duplicates) {
  if (files.length > 1) {
    console.error(`[architecture] duplicate basename: ${key}\n  - ${files.join('\n  - ')}`);
    process.exitCode = 1;
  }
}

const required = [
  'apps/web/server.js',
  'apps/web/package.json',
  'apps/admin/server.js',
  'apps/admin/package.json'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`[architecture] required file missing: ${file}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error('[architecture] guard failed. Remove stale/duplicate artifacts before merging.');
  process.exit(1);
}
console.log('[architecture] guard passed.');
