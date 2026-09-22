/* Customer 360 outcome summary helpers.
 * Kept isolated so the existing Customer 360 renderer can consume a stable,
 * normalized result without duplicating attribution logic.
 */
export function buildCustomer360OutcomeSummary(profile = {}) {
  const actions = Array.isArray(profile.relatedActions) ? profile.relatedActions : [];
  const completed = actions.filter(item => ['completed', 'executed', 'converted'].includes(String(item.status || '').toLowerCase()));
  const attributed = actions.filter(item => item.orderId);
  const revenue = actions.reduce((sum, item) => sum + Number(item.resultRevenue || 0), 0);
  const last = completed
    .slice()
    .sort((a, b) => Date.parse(b.completedAt || b.updatedAt || b.createdAt || 0) - Date.parse(a.completedAt || a.updatedAt || a.createdAt || 0))[0] || null;

  return {
    actionCount: actions.length,
    completedCount: completed.length,
    attributedOrderCount: attributed.length,
    measuredRevenue: revenue,
    lastOutcome: last
      ? {
          status: last.status || '',
          orderId: last.orderId || '',
          revenue: Number(last.resultRevenue || 0),
          at: last.completedAt || last.updatedAt || last.createdAt || ''
        }
      : null
  };
}
