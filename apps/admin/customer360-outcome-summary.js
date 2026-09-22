/* Customer 360 outcome summary.
 * Standalone enhancement: does not modify app.js and fails safely if the
 * Customer 360 modal is unavailable.
 */
export function buildCustomer360OutcomeSummary(profile = {}) {
  const actions = Array.isArray(profile.relatedActions) ? profile.relatedActions : [];
  const normalizedStatus = item => String(item?.status || '').toLowerCase();
  const completed = actions.filter(item => ['completed', 'executed', 'converted'].includes(normalizedStatus(item)));
  const converted = actions.filter(item => normalizedStatus(item) === 'converted');
  const attributed = actions.filter(item => item?.orderId);
  const revenue = actions.reduce((sum, item) => sum + Math.max(0, Number(item?.resultRevenue || 0)), 0);
  const last = completed
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0] || null;

  return {
    actionCount: actions.length,
    completedCount: completed.length,
    convertedCount: converted.length,
    attributedOrderCount: attributed.length,
    measuredRevenue: Math.round(revenue * 100) / 100,
    lastOutcome: last
      ? {
          status: last.status || '',
          orderId: last.orderId || '',
          revenue: Math.max(0, Number(last.resultRevenue || 0)),
          at: last.completedAt || last.updatedAt || '',
          reason: last.outcomeReason || '',
          note: last.outcomeReasonNote || ''
        }
      : null
  };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[char]));

const apiBase = () => (
  localStorage.getItem('ARABISK_API_BASE') ||
  window.ARABISK_API_BASE ||
  (location.hostname === 'localhost' ? 'http://localhost:3000' : '/proxy')
).replace(/\/$/, '');

const money = value => 'AED ' + Number(value || 0).toFixed(0);
const statusLabel = value => ({
  completed:'مكتمل',
  executed:'تم التنفيذ',
  converted:'تحول إلى طلب',
  ignored:'تجاهل',
  draft:'مسودة'
}[String(value || '').toLowerCase()] || value || '—');

let activeCustomerId = '';
let renderToken = 0;

function ensureStyles() {
  if (document.getElementById('customer360-outcome-summary-styles')) return;
  const style = document.createElement('style');
  style.id = 'customer360-outcome-summary-styles';
  style.textContent = `
    .customer360-outcome-summary{margin:16px 0;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:rgba(255,255,255,.025)}
    .customer360-outcome-summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
    .customer360-outcome-summary-head h3{margin:0 0 4px;font-size:16px}
    .customer360-outcome-summary-head p{margin:0;color:var(--muted,#8f98a8);font-size:12px}
    .customer360-outcome-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .customer360-outcome-summary-grid article{padding:12px;border-radius:12px;background:rgba(255,255,255,.035);min-width:0}
    .customer360-outcome-summary-grid span{display:block;color:var(--muted,#8f98a8);font-size:11px;margin-bottom:6px}
    .customer360-outcome-summary-grid b{display:block;font-size:18px;overflow-wrap:anywhere}
    .customer360-outcome-last{margin-top:10px;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.025);display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px}
    .customer360-outcome-last strong{margin-inline-end:auto}
    @media(max-width:760px){.customer360-outcome-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);
}

function renderSummary(profile, customerId) {
  if (!customerId || customerId !== activeCustomerId) return;
  const body = document.querySelector('#customer360-body');
  if (!body || !body.querySelector('.customer360-head')) return;

  const summary = buildCustomer360OutcomeSummary(profile);
  const last = summary.lastOutcome;
  const lastHtml = last
    ? '<div class="customer360-outcome-last"><strong>آخر نتيجة: '+esc(statusLabel(last.status))+'</strong>'+
      (last.orderId ? '<span>الطلب #'+esc(last.orderId)+'</span>' : '<span>بدون طلب منسوب</span>')+
      '<span>'+money(last.revenue)+'</span>'+
      (last.reason ? '<span>السبب: '+esc(last.reason)+'</span>' : '')+
      (last.note ? '<span>ملاحظة: '+esc(last.note)+'</span>' : '')+
      (last.at ? '<time>'+esc(new Date(last.at).toLocaleString('ar-AE'))+'</time>' : '')+
      '</div>'
    : '<div class="customer360-outcome-last"><strong>لا توجد نتيجة مكتملة مسجلة بعد.</strong></div>';

  const html =
    '<section class="customer360-outcome-summary" data-customer360-outcome-summary>'+
      '<div class="customer360-outcome-summary-head"><div><h3>نتيجة إجراءات العميل</h3><p>قياس ما حدث بعد الفرص والإجراءات المسجلة لهذا العميل.</p></div><b>'+money(summary.measuredRevenue)+'</b></div>'+
      '<div class="customer360-outcome-summary-grid">'+
        '<article><span>إجمالي الإجراءات</span><b>'+summary.actionCount+'</b></article>'+
        '<article><span>إجراءات مكتملة</span><b>'+summary.completedCount+'</b></article>'+
        '<article><span>تحولت إلى طلب</span><b>'+summary.convertedCount+'</b></article>'+
        '<article><span>طلبات منسوبة</span><b>'+summary.attributedOrderCount+'</b></article>'+
      '</div>'+lastHtml+
    '</section>';

  body.querySelector('[data-customer360-outcome-summary]')?.remove();
  const stats = body.querySelector('.customer360-stats');
  if (stats) stats.insertAdjacentHTML('afterend', html);
  else body.querySelector('.customer360-head')?.insertAdjacentHTML('afterend', html);
}

async function refreshSummary(customerId) {
  const token = ++renderToken;
  try {
    const response = await fetch(apiBase() + '/api/revenue/customers/' + encodeURIComponent(customerId) + '/360', {
      headers:{'Content-Type':'application/json'}
    });
    if (!response.ok) return;
    const profile = await response.json();
    if (token !== renderToken) return;
    renderSummary(profile, customerId);
  } catch (_) {
    // Enhancement is non-critical; Customer 360 remains usable on failure.
  }
}

document.addEventListener('click', event => {
  const opener = event.target.closest('[data-customer-360]');
  if (opener?.dataset.customer360) {
    activeCustomerId = opener.dataset.customer360;
    queueMicrotask(() => refreshSummary(activeCustomerId));
  }
}, true);

const observer = new MutationObserver(() => {
  if (!activeCustomerId) return;
  const body = document.querySelector('#customer360-body');
  if (body?.querySelector('.customer360-head') && !body.querySelector('[data-customer360-outcome-summary]')) {
    refreshSummary(activeCustomerId);
  }
});
observer.observe(document.documentElement, {subtree:true, childList:true});
ensureStyles();


let customer360OutcomeRefreshTimer = 0;

function scheduleCustomer360OutcomeRefresh(delay = 180) {
  window.clearTimeout(customer360OutcomeRefreshTimer);
  customer360OutcomeRefreshTimer = window.setTimeout(() => {
    if (activeCustomerId) void refreshSummary(activeCustomerId);
  }, delay);
}

function patchFetchForCustomer360OutcomeRefresh() {
  if (window.__ARABISK_CUSTOMER360_OUTCOME_FETCH_PATCHED__) return;
  window.__ARABISK_CUSTOMER360_OUTCOME_FETCH_PATCHED__ = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const input = args[0];
      const rawUrl = typeof input === 'string' ? input : (input?.url || '');
      const method = String(args[1]?.method || input?.method || 'GET').toUpperCase();
      const path = new URL(rawUrl, window.location.href).pathname;

      const relevant =
        (method === 'POST' && (
          path.endsWith('/api/revenue/campaign-drafts') ||
          /\/api\/revenue\/campaigns\/[^/]+\/outcome$/.test(path)
        )) ||
        (method === 'PATCH' && /\/api\/orders\/[^/]+$/.test(path));

      if (response.ok && relevant && activeCustomerId) {
        scheduleCustomer360OutcomeRefresh();
      }
    } catch (_) {
      // Never change the original fetch result because of this enhancement.
    }

    return response;
  };
}

patchFetchForCustomer360OutcomeRefresh();
