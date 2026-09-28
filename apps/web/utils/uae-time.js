const UAE_TIME_ZONE = 'Asia/Dubai';
const UAE_OFFSET = '+04:00';

function partsFor(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UAE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function getUaeDateOnly(date = new Date()) {
  const parts = partsFor(date);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

export function addUaeDays(date, offsetDays = 0) {
  const parts = partsFor(date);
  const base = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + Number(offsetDays), 0, 0, 0);
  return new Date(base).toISOString().slice(0, 10);
}

export function parseUaeLocalDateTime(date, time = '00:00') {
  const rawDate = String(date || '').trim();
  const rawTime = String(time || '00:00').trim();
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(rawDate)) return NaN;
  if (!/^\\d{2}:\\d{2}$/.test(rawTime)) return NaN;
  return Date.parse(rawDate + 'T' + rawTime + ':00' + UAE_OFFSET);
}

export function getUaeTimeContext(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: UAE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZoneName: 'short'
  }).formatToParts(date);
  const map = Object.fromEntries(formatted.map(part => [part.type, part.value]));
  return {
    timeZone: UAE_TIME_ZONE,
    date: map.year + '-' + map.month + '-' + map.day,
    time: map.hour + ':' + map.minute,
    weekday: map.weekday,
    utcOffset: UAE_OFFSET
  };
}

export { UAE_TIME_ZONE };
