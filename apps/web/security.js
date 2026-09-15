export const adminSecret = String(process.env.ARABISK_ADMIN_API_SECRET || '').trim();

export function requireAdmin(req, res, next) {
  if (!adminSecret || req.get('x-arabisk-admin-secret') !== adminSecret) {
    return res.status(401).json({ message: 'Admin authentication required.' });
  }
  return next();
}
