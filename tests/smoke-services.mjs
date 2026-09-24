import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const WEB_PORT = 4310;
const ADMIN_PORT = 4311;

function startService(script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  return { child, getLogs: () => ({ stdout, stderr }) };
}

async function waitForHttp(url, child, getLogs, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Service exited with code ${child.exitCode} before readiness: ${JSON.stringify(getLogs())}`);
    }
    try {
      const response = await fetch(url);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Service readiness timed out: ${lastError?.message || 'unknown error'}; logs=${JSON.stringify(getLogs())}`);
}

async function requestJson(url, expectedStatus) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });
  assert.equal(response.status, expectedStatus, `Unexpected status for ${url}`);
  return response.json();
}

const web = startService('apps/web/server.js', {
  NODE_ENV: 'test',
  PORT: String(WEB_PORT),
  ARABISK_ADMIN_API_KEY: 'ci-smoke-test-key-123456789012345678901234567890',
  ARABISK_CORS_ORIGINS: `http://localhost:${ADMIN_PORT}`
});

const admin = startService('apps/admin/server.js', {
  NODE_ENV: 'test',
  PORT: String(ADMIN_PORT),
  ARABISK_ADMIN_USERNAME: 'ci',
  ARABISK_ADMIN_PASSWORD: 'ci',
  ARABISK_ADMIN_API_KEY: 'ci-smoke-test-key-123456789012345678901234567890',
  ARABISK_WEB_API_URL: `http://127.0.0.1:${WEB_PORT}`
});

try {
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}/health`, web.child, web.getLogs);
  const health = await requestJson(`http://127.0.0.1:${WEB_PORT}/health`, 200);
  assert.equal(health.ok, true);
  assert.equal(health.service, 'arabisk-web');

  const products = await requestJson(`http://127.0.0.1:${WEB_PORT}/api/products`, 200);
  assert.ok(Array.isArray(products) && products.length > 0, 'Web product catalog should be available');

  const categories = await requestJson(`http://127.0.0.1:${WEB_PORT}/api/categories`, 200);
  assert.ok(Array.isArray(categories) && categories.length > 0, 'Web category catalog should be available');

  await waitForHttp(`http://127.0.0.1:${ADMIN_PORT}/health`, admin.child, admin.getLogs);
  const adminHealth = await requestJson(`http://127.0.0.1:${ADMIN_PORT}/health`, 200);
  assert.equal(adminHealth.ok, true);
  assert.equal(adminHealth.service, 'arabisk-admin');

  const loginPage = await fetch(`http://127.0.0.1:${ADMIN_PORT}/login`);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /<html/i);

  const sessionResponse = await fetch(`http://127.0.0.1:${ADMIN_PORT}/auth/session`);
  assert.equal(sessionResponse.status, 401);

  const protectedProxyResponse = await fetch(`http://127.0.0.1:${ADMIN_PORT}/proxy/api/categories`);
  assert.equal(protectedProxyResponse.status, 401);

  console.log('Runtime smoke checks passed: web health/catalog + admin health/login/session/proxy guards.');
} finally {
  for (const service of [admin, web]) {
    if (service.child.exitCode === null) service.child.kill('SIGTERM');
  }
}
