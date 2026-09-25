export function createCollectionRepository(items, { persist, persistOnAdd = false } = {}) {
  const save = () => persist?.();

  return {
    all: () => items,
    findById: (id) => items.find(item => item.id === id),
    find: (predicate) => items.find(predicate),
    add: (item) => {
      items.push(item);
      if (persistOnAdd) save();
      return item;
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
