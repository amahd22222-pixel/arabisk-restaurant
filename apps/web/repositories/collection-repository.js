export function createCollectionRepository(items, { persist, persistOnAdd = false } = {}) {
  const save = async () => {
    if (!persist) return true;
    const result = await persist();
    if (result === false) throw new Error('Repository state could not be persisted to storage.');
    return true;
  };

  return {
    all: () => items,
    findById: (id) => items.find(item => item.id === id),
    find: (predicate) => items.find(predicate),
    filter: (predicate) => items.filter(predicate),
    some: (predicate) => items.some(predicate),
    add: (item) => {
      items.push(item);
      if (persistOnAdd) void save().catch(() => {});
      return item;
    },
    replaceAll: (nextItems) => {
      if (!Array.isArray(nextItems)) throw new TypeError('Repository data must be an array');
      items.splice(0, items.length, ...nextItems);
      return items;
    },
    removeById: (id) => {
      const index = items.findIndex(item => item.id === id);
      if (index < 0) return null;
      const [removed] = items.splice(index, 1);
      return removed;
    },
    save
  };
}
