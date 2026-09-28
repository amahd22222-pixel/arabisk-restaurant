import test from 'node:test';
import assert from 'node:assert/strict';
import { readRequiredSnapshot, writeRequiredSnapshot } from '../apps/web/repositories/restore-helper.js';

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

test('writeRequiredSnapshot succeeds when storage confirms the write', async () => {
  const written = await writeRequiredSnapshot(
    async () => true,
    'data/test.json',
    { version: 1 },
    'persist failed'
  );
  assert.equal(written, true);
});

test('writeRequiredSnapshot rejects when storage reports a failed write', async () => {
  await assert.rejects(
    () => writeRequiredSnapshot(
      async () => false,
      'data/test.json',
      { version: 1 },
      'persist failed'
    ),
    /persist failed/
  );
});
