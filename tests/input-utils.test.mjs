import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, cleanKey, cleanUrl, normalizeList, isValidDateOnly } from '../apps/web/utils/input.js';

test('input utilities normalize boundaries consistently', () => {
  assert.equal(cleanText('  Arabesque  ', 20), 'Arabesque');
  assert.equal(cleanText('abcdefghijklmnopqrstuvwxyz', 5), 'abcde');
  assert.equal(cleanKey('/media/menu/item.jpg'), 'media/menu/item.jpg');
  assert.equal(cleanUrl('  https://example.com/item.jpg  '), 'https://example.com/item.jpg');

  const allowed = new Set(['vegan', 'spicy']);
  assert.deepEqual(
    normalizeList([' Vegan ', 'SPICY', 'vegan', 'other'], allowed, 8),
    ['vegan', 'spicy']
  );
  assert.deepEqual(normalizeList('not-an-array', allowed), []);
});

test('date utility accepts real calendar dates and rejects impossible dates', () => {
  assert.equal(isValidDateOnly('2028-02-29'), true);
  assert.equal(isValidDateOnly('2099-02-29'), false);
  assert.equal(isValidDateOnly('2099-02-31'), false);
  assert.equal(isValidDateOnly('2099-13-01'), false);
  assert.equal(isValidDateOnly('2099-01-01'), true);
});
