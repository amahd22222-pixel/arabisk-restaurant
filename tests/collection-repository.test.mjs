import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionRepository } from '../apps/web/repositories/collection-repository.js';

test('collection repository keeps CRUD and persistence behavior explicit', () => {
  const items = [{ id: 'P001', name: 'First' }];
  let saves = 0;
  const repository = createCollectionRepository(items, { persist: () => { saves += 1; } });

  assert.equal(repository.findById('P001').name, 'First');
  assert.equal(repository.findById('missing'), undefined);
  assert.deepEqual(repository.filter(item => item.id === 'P001'), [{ id: 'P001', name: 'First' }]);
  assert.equal(repository.some(item => item.name === 'First'), true);
  assert.equal(repository.some(item => item.name === 'Missing'), false);

  repository.add({ id: 'P002', name: 'Second' });
  assert.equal(items.length, 2);
  assert.equal(saves, 0);

  repository.save();
  assert.equal(saves, 1);

  const removed = repository.removeById('P001');
  assert.equal(removed.id, 'P001');
  assert.equal(repository.removeById('missing'), null);
  assert.equal(items.length, 1);

  const replaced = repository.replaceAll([{ id: 'P003', name: 'Third' }]);
  assert.equal(replaced, items);
  assert.deepEqual(items, [{ id: 'P003', name: 'Third' }]);

  assert.throws(
    () => repository.replaceAll({ id: 'invalid' }),
    { name: 'TypeError' }
  );
});
