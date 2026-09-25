import test from 'node:test';
import assert from 'node:assert/strict';
import { createNextPrefixedId } from '../apps/web/utils/id-generator.js';

test('id generator supports repository boundaries', () => {
  const items = [{ id: 'P002' }, { id: 'P010' }, { id: 'X099' }];
  const repository = {
    all: () => items
  };

  const nextId = createNextPrefixedId(repository, 'P', 3);
  assert.equal(nextId(), 'P011');

  items.push({ id: 'P014' });
  assert.equal(nextId(), 'P015');
});

test('id generator remains compatible with plain collections', () => {
  const nextId = createNextPrefixedId([{ id: 'R003' }], 'R', 4);
  assert.equal(nextId(), 'R0004');
});
