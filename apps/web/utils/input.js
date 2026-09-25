export const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export const cleanKey = (value) => String(value ?? '').trim().replace(/^\/+/, '').slice(0, 500);

export const cleanUrl = (value) => String(value ?? '').trim().slice(0, 1000);

export const normalizeList = (value, allowed, max = 8) =>
  Array.isArray(value)
    ? [...new Set(
        value
          .map(item => String(item ?? '').trim().toLowerCase())
          .filter(item => allowed.has(item))
      )].slice(0, max)
    : [];
