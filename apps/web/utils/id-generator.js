export function createNextPrefixedId(collection, prefix, width) {
  return () => {
    const max = collection.reduce((highest, item) => {
      const rawId = String(item.id || '');
      const numericPart = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : '';
      const value = Number(numericPart);
      return Math.max(highest, value || 0);
    }, 0);
    return prefix + String(max + 1).padStart(width, '0');
  };
}
