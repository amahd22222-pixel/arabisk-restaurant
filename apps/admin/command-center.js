import { request } from './api-client.js';

const $ = (selector) => document.querySelector(selector);
const state = { products: [], categories: [], orders: [], reservations: [], loadedAt: null };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function money(value) {
  return 'AED ' + Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 });
}
function localDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function reservationDay(item) {
  const raw = String(item?.date || '').slice(0, 10);
  return raw || '';
}
function sameDay(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && localDayKey(d) === localDayKey();
}
function minutesSince(iso) {
  const time = new Date(iso || 0).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}
function go(section) {
  const link = document.querySelector(`[data-section="${CSS.escape(section)}"]`);
  link?.click();
}
function orderLabel(status) {
  return ({pending:'قيد المراجعة',confirmed:'مؤكد',preparing:'قيد التحضير',ready:'جاهز',completed:'مكتمل',cancelled:'ملغي'})[status] || status || 'غير معروف';
}
function statusClass(status) {
  return status === 'completed' ? 'high' : status === 'cancelled' ? 'high' : 'medium';
}
function render() {
  const todayOrders = state.orders.filter(o => sameDay(o.createdAt));
  const activeOrders = state.orders.filter(o => !['completed','cancelled'].includes(o.status));
  const completedToday = todayOrders.filter(o => o.status === 'completed');
  const revenueToday = completedToday.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const availableProducts = state.products.filter(p => p.available);
  const todayReservations = state.reservations.filter(r => reservationDay(r) === localDayKey());
  const counts = state.orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
  const averageOrder = todayOrders.length ? todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) / todayOrders.length : 0;

  $('#cc-orders-now').textContent = activeOrders.length;
  $('#cc-orders-note').textContent = `${todayOrders.length} طلب اليوم`;
  $('#cc-reservations-today').textContent = todayReservations.length;
  $('#cc-reservations-note').textContent = todayReservations.length ? `${todayReservations.reduce((s,r)=>s+Number(r.guests||0),0)} ضيف` : 'لا توجد حجوزات مسجلة';
  $('#cc-products-available').textContent = availableProducts.length;
  $('#cc-products-note').textContent = `من ${state.products.length} صنف`;
  $('#cc-revenue-today').textContent = money(revenueToday);
  $('#cc-revenue-note').textContent = `${completedToday.length} طلب مكتمل`;
  $('#cc-orders-today').textContent = todayOrders.length;
  $('#cc-average-order').textContent = money(averageOrder);

  ['pending','confirmed','preparing','ready','completed'].forEach(status => {
    const node = $(`#cc-flow-${status}`);
    if (node) node.textContent = counts[status] || 0;
  });

  const alerts = [];
  const stale = activeOrders.filter(o => ['pending','confirmed','preparing'].includes(o.status))
    .map(o => ({ order:o, minutes:minutesSince(o.createdAt) }))
    .filter(x => x.minutes !== null && x.minutes >= 20)
    .sort((a,b)=>b.minutes-a.minutes)
    .slice(0,3);
  stale.forEach(({order, minutes}) => alerts.push({
    level: minutes >= 45 ? 'high' : 'medium',
    title: `طلب ${esc(order.id)} يحتاج متابعة`,
    detail: `الحالة: ${esc(orderLabel(order.status))} — منذ ${minutes} دقيقة.`
  }));
  if (state.products.length && availableProducts.length < state.products.length) {
    alerts.push({
      level:'low',
      title:`${state.products.length - availableProducts.length} صنف مخفي أو غير متاح`,
      detail:'راجع المنيو قبل ساعات الذروة.'
    });
  }
  const cancelledToday = todayOrders.filter(o => o.status === 'cancelled').length;
  if (cancelledToday) alerts.push({level:'medium', title:`${cancelledToday} طلب ملغي اليوم`, detail:'راجع سبب الإلغاء من شاشة الطلبات.'});
  if (!alerts.length) alerts.push({level:'low', title:'لا توجد تنبيهات تشغيلية عاجلة', detail:'التشغيل يبدو هادئًا حاليًا.'});
  $('#cc-alert-count').textContent = alerts.filter(a => a.level !== 'low').length;
  $('#cc-alerts').innerHTML = alerts.map(a => `<article class="cc-alert ${a.level}"><i class="cc-alert-mark" aria-hidden="true"></i><div><strong>${a.title}</strong><span>${a.detail}</span></div></article>`).join('');

  const todaysReservations = todayReservations.sort((a,b) => String(a.time||'').localeCompare(String(b.time||''))).slice(0,5);
  $('#cc-reservations').innerHTML = todaysReservations.length ? todaysReservations.map(r => `
    <article class="cc-reservation">
      <div><strong>${esc(r.name)}</strong><small>${esc(r.time)} — ${esc(r.phone)}</small></div>
      <div class="cc-reservation-meta"><b>${Number(r.guests||0)} ضيف</b><span>${esc(r.status==='confirmed'?'مؤكد':r.status==='cancelled'?'ملغي':'قيد المراجعة')}</span></div>
    </article>`).join('') : '<div class="cc-empty">لا توجد حجوزات اليوم.</div>';

  const productTotals = new Map();
  state.orders.forEach(order => (order.items || []).forEach(item => {
    const key = item.productId || item.nameAr || 'unknown';
    const current = productTotals.get(key) || {name:item.nameAr || key, quantity:0, orders:0};
    current.quantity += Number(item.quantity || 0);
    current.orders += 1;
    productTotals.set(key, current);
  }));
  const topProducts = [...productTotals.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,5);
  $('#cc-top-products').innerHTML = topProducts.length ? topProducts.map((item,index)=>`
    <article class="cc-product"><span class="cc-product-rank">${index+1}</span><div><strong>${esc(item.name)}</strong><small>${item.orders} طلب مرتبط</small></div><b>${item.quantity}×</b></article>`).join('') : '<div class="cc-empty">لا توجد بيانات طلبات كافية بعد.</div>';

  state.loadedAt = new Date();
  $('#cc-last-sync').textContent = 'آخر مزامنة: ' + state.loadedAt.toLocaleTimeString('ar-AE', {hour:'2-digit', minute:'2-digit'});
  $('#cc-live-label').textContent = 'متصل ومزامن';
}
async function load() {
  const live = $('.live-pill');
  live?.classList.add('is-syncing');
  $('#cc-live-label').textContent = 'جارٍ تحديث البيانات';
  try {
    const endpoints = [['products','/api/products'],['categories','/api/categories'],['orders','/api/orders'],['reservations','/api/reservations']];
    const results = await Promise.all(endpoints.map(async ([key,path]) => [key, await request(path)]));
    results.forEach(([key,value]) => { state[key] = Array.isArray(value) ? value : []; });
    render();
  } catch (error) {
    $('#cc-live-label').textContent = 'تعذر المزامنة';
    $('#cc-alert-count').textContent = '!';
    $('#cc-alerts').innerHTML = `<div class="cc-error">${esc(error.message || 'تعذر تحميل بيانات مركز القيادة.')}</div>`;
  } finally {
    live?.classList.remove('is-syncing');
  }
}
function wire() {
  $('#cc-refresh')?.addEventListener('click', () => void load());
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-cc-nav]');
    if (nav) go(nav.dataset.ccNav);
    const step = event.target.closest('[data-cc-status]');
    if (step) {
      go('orders');
      setTimeout(() => {
        const status = step.dataset.ccStatus;
        const select = document.querySelector(`select[data-order-status]`);
        if (!select) return;
        const first = [...document.querySelectorAll('select[data-order-status]')].find(s => s.value === status);
        first?.closest('tr')?.scrollIntoView({behavior:'smooth',block:'center'});
      }, 120);
    }
    const command = event.target.closest('[data-shams-command]');
    if (command) go(command.dataset.shamsCommand);
  });
}
wire();
void load();
