export function createNextPrefixedId(collection, prefix, width) {
  return () => {
    const max = collection.reduce((highest, item) => {
      const value = Number(String(item.id || '').replace(prefix, ''));
      return Math.max(highest, value || 0);
    }, 0);
    return prefix + String(max + 1).padStart(width, '0');
  };
}
