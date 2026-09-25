import test from 'node:test';
import assert from 'node:assert/strict';
import { readRequiredSnapshot } from '../apps/web/repositories/restore-helper.js';

test('readRequiredSnapshot returns stored value for a valid snapshot', async () => {
  const value = await readRequiredSnapshot(
    async () => ({ ok: true, found: true, value: { version: 1 } }),
    'data/test.json',
    'restore failed'
  );
  assert.deepEqual(value, { version: 1 });
});

test('readRequiredSnapshot returns null for a missing snapshot', async () => {
  const value = await readRequiredSnapshot(
    async () => ({ ok: true, found: false, value: null, reason: 'not_found' }),
    'data/test.json',
    'restore failed'
  );
  assert.equal(value, null);
});

test('readRequiredSnapshot throws on a storage read failure', async () => {
  await assert.rejects(
    () => readRequiredSnapshot(
      async () => ({ ok: false, found: false, value: null, reason: 'read_failed' }),
      'data/test.json',
      'restore failed'
    ),
    /restore failed/
  );
});
