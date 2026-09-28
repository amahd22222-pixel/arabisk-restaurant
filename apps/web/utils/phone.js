export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (/^00971(5\d{8})$/.test(digits)) return '+971' + digits.slice(5);
  if (/^971(5\d{8})$/.test(digits)) return '+' + digits;
  if (/^05\d{8}$/.test(digits)) return '+971' + digits.slice(1);

  if (/^0020(1[0125]\d{8})$/.test(digits)) return '+20' + digits.slice(4);
  if (/^20(1[0125]\d{8})$/.test(digits)) return '+' + digits;
  if (/^01[0125]\d{8}$/.test(digits)) return '+20' + digits.slice(1);

  if (/^00966(5\d{8})$/.test(digits)) return '+966' + digits.slice(5);
  if (/^966(5\d{8})$/.test(digits)) return '+' + digits;
  if (/^05\d{8}$/.test(digits)) return '+966' + digits.slice(1);

  if (/^00963(9\d{8})$/.test(digits)) return '+963' + digits.slice(5);
  if (/^963(9\d{8})$/.test(digits)) return '+' + digits;
  if (/^09\d{8}$/.test(digits)) return '+963' + digits.slice(1);

  if (/^00961(?:3|7|8)\d{6}$/.test(digits)) return '+961' + digits.slice(5);
  if (/^961(?:3|7|8)\d{6}$/.test(digits)) return '+' + digits;
  if (/^(?:3|7|8)\d{6}$/.test(digits)) return '+961' + digits;

  if (digits.length >= 7 && digits.length <= 15) return '+' + digits;
  return '';
}
