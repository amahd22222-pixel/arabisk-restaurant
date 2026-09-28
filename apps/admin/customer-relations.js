(() => {
'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

const money = value => 'AED ' + Number(value || 0).toFixed(0);
const dateLabel = value => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString('ar-AE') : '—';
};
const dateTimeLabel = value => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('ar-AE') : '—';
};

const lifecycleClass = key => ({
  new:'customer-lifecycle-new',
  active:'customer-lifecycle-active',
  dormant:'customer-lifecycle-dormant',
  lapsed:'customer-lifecycle-lapsed'
}[key] || 'customer-lifecycle-new');

function lifecycleLabel(customer) {
  return customer?.lifecycleLabel || ({
    new:'جديد',
    active:'نشط',
    dormant:'خامل',
    lapsed:'غير نشط'
  }[customer?.lifecycleKey] || 'غير محدد');
}

let summary = null;
let loaded = false;
let loading = null;

function ensurePanel() {
  const section = document.querySelector('#customers');
  const head = section?.querySelector('.panelhead');
  if (!head) return null;
  let panel = document.querySelector('#customer-relationship-panel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'customer-relationship-panel';
  panel.className = 'customer-relationship-panel';
  panel.innerHTML = '<div class="customer-relationship-head"><div><h3>مركز علاقة العملاء</h3><p>هوية موحّدة لكل عميل وربط الطلبات والحجوزات ونشاط التطبيق في مكان واحد.</p></div><div class="customer-relationship-badge">الهوية: الهاتف + Customer ID · بدون بريد إلكتروني</div></div><div id="customer-relationship-kpis" class="customer-relationship-kpis"></div><div class="customer-relationship-lists"><div class="customer-relationship-list"><h4>أعلى العملاء حسب قيمة الطلبات المكتملة</h4><div class="table-wrap"><table><thead><tr><th>العميل</th><th>الطلبات</th><th>القيمة</th><th>آخر نشاط</th><th>الحالة</th><th></th></tr></thead><tbody id="customer-relationship-top-body"></tbody></table></div></div><div class="customer-relationship-list"><h4>سياسة هوية العميل</h4><div class="customer-relationship-note">لا نطلب البريد الإلكتروني. رقم الهاتف هو المفتاح العملي للربط، وCustomer ID هو المعرّف الداخلي الثابت. اختلاف صيغة الرقم المحلية لا ينشئ عميلاً جديدًا عندما يمكن توحيده.</div><div id="customer-relationship-value-note" class="customer-relationship-note"></div></div></div>';
  head.insertAdjacentElement('afterend', panel);

  document.querySelector('#customer-relationship-refresh')?.addEventListener('click', () => void load(true));
  return panel;
}

function render() {
  const panel = ensurePanel();
  if (!panel || !summary) return;

  const counts = summary.counts || {};
  const value = summary.value || {};
  const kpis = panel.querySelector('#customer-relationship-kpis');
  if (kpis) {
    kpis.innerHTML = [
      ['إجمالي العملاء', counts.total || 0, 'كل الملفات الموحدة'],
      ['جدد آخر 7 أيام', counts.new7d || 0, 'أول تفاعل'],
      ['نشطون آخر 30 يوم', counts.active30d || 0, 'آخر نشاط'],
      ['خاملون 31–90 يوم', counts.dormant31to90d || 0, 'تحتاج مراجعة'],
      ['غير نشطين +90 يوم', counts.lapsed90dPlus || 0, 'تاريخ محفوظ'],
      ['أعضاء التطبيق', counts.appMembers || 0, 'ملف داخل PWA']
    ].map(([label,count,note]) => '<article><span>'+esc(label)+'</span><b>'+Number(count||0).toLocaleString('ar-AE')+'</b><small class="customer-relationship-sub">'+esc(note)+'</small></article>').join('');
  }

  const body = panel.querySelector('#customer-relationship-top-body');
  const rows = (summary.topCustomers || []).map(customer =>
    '<tr class="customer-relationship-top-row">'+
      '<td><strong>'+esc(customer.name || 'عميل')+'</strong><small dir="ltr">'+esc(customer.phone || '')+'</small></td>'+
      '<td>'+Number(customer.orderCount||0)+'</td>'+
      '<td class="customer-value">'+money(customer.totalOrderValue)+'</td>'+
      '<td class="customer-last-activity">'+esc(dateLabel(customer.lastActivityAt))+'</td>'+
      '<td><span class="customer-lifecycle '+lifecycleClass(customer.lifecycleKey)+'">'+esc(lifecycleLabel(customer))+'</span></td>'+
      '<td class="actions"><button class="small-action" type="button" data-customer-360="'+esc(customer.id)+'">فتح الملف</button></td>'+
    '</tr>'
  ).join('');
  if (body) body.innerHTML = rows || '<tr><td colspan="6" class="customer-relationship-empty">لا توجد طلبات مكتملة كافية لبناء قائمة قيمة.</td></tr>';

  const note = panel.querySelector('#customer-relationship-value-note');
  if (note) note.textContent = 'إجمالي قيمة الطلبات المكتملة المرتبطة بالعملاء: '+money(value.totalCompletedOrderValue)+'. العملاء الذين لديهم حجوزات: '+Number(value.customersWithReservations||0)+'.';
}

function enhanceCustomerTable() {
  const body = document.querySelector('#customers-body');
  const customers = Array.isArray(window.__ARABISK_CUSTOMERS__) ? window.__ARABISK_CUSTOMERS__ : [];
  if (!body || !customers.length) return;

  const byId = new Map(customers.map(item => [String(item.id), item]));
  const table = body.closest('table');
  if (table) {
    table.classList.add('customers-table-enhanced');
    const head = table.querySelector('thead tr');
    if (head && head.dataset.customerEnhanced !== '1') {
      head.dataset.customerEnhanced = '1';
      head.insertAdjacentHTML('beforeend','<th>قيمة الطلبات</th><th>آخر نشاط</th><th>الحالة</th>');
    }
  }

  body.querySelectorAll('tr').forEach(row => {
    const button = row.querySelector('[data-customer-360]');
    const id = button?.dataset.customer360 || '';
    const customer = byId.get(String(id));
    if (!customer) return;
    while (row.children.length > 5) row.lastElementChild.remove();
    row.insertAdjacentHTML('beforeend',
      '<td class="customer-value">'+money(customer.totalOrderValue)+'</td>'+
      '<td class="customer-last-activity">'+esc(dateTimeLabel(customer.lastActivityAt))+'</td>'+
      '<td><span class="customer-lifecycle '+lifecycleClass(customer.lifecycleKey)+'">'+esc(lifecycleLabel(customer))+'</span></td>'
    );
  });
}

async function load(force = false) {
  if (loaded && !force) {
    ensurePanel();
    render();
    enhanceCustomerTable();
    return;
  }
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch((typeof window.apiBase === 'function' ? window.apiBase() : '') + '/api/customers/relationship-summary', {
        headers: typeof window.request === 'function' ? undefined : {}
      });
      if (!response.ok) throw new Error('تعذر تحميل مركز علاقة العملاء.');
      summary = await response.json();
      loaded = true;
      render();
      enhanceCustomerTable();
    } catch (error) {
      const panel = ensurePanel();
      const note = panel?.querySelector('#customer-relationship-value-note');
      if (note) note.textContent = error.message || 'تعذر تحميل بيانات علاقة العملاء.';
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function boot() {
  ensurePanel();
  void load();
  window.addEventListener('arabisk:customer-state-updated', () => {
    render();
    enhanceCustomerTable();
    void load(true);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
else boot();

window.ARABISK_CUSTOMER_RELATIONSHIP = { load, refresh: () => load(true) };
})();
