export const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);

export const cleanUrl = (value) => {
  const text = String(value ?? '').trim().slice(0, 1000);
  if (!text || text.includes('\\0')) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  return /^https?:\\/\\//i.test(text) ? text : '';
};

export const normalizeList = (value, allowed, max = 8) =>
  Array.isArray(value)
    ? [...new Set(
        value
          .map(item => String(item ?? '').trim().toLowerCase())
          .filter(item => allowed.has(item))
      )].slice(0, max)
    : [];


export const isValidDateOnly = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};
