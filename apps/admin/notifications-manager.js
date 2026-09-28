import { request } from './api-client.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  status: null,
  campaigns: [],
  devices: []
};

const templates = {
  event: {
    title: 'فعالية ARABISK غدًا ✨',
    body: 'ليلة مميزة تنتظركم في ARABISK. احجز طاولتك الآن.',
    url: '/reservation'
  },
  offer: {
    title: 'عرض جديد من ARABISK 🎁',
    body: 'استفد من عرضنا الحالي واطلب الآن قبل انتهاء المدة.',
    url: '/menu'
  },
  menu: {
    title: 'اكتشف الجديد في منيو ARABISK',
    body: 'أضفنا اختيارات جديدة لتجربتك القادمة.',
    url: '/menu'
  },
  booking: {
    title: 'تذكير بحجزك في ARABISK',
    body: 'ننتظركم قريبًا. راجع تفاصيل الحجز من التطبيق.',
    url: '/reservation'
  },
  general: {
    title: 'جديد من ARABISK',
    body: 'لدينا خبر جديد نود مشاركته معك.',
    url: '/'
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-AE', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status) {
  return ({
    queued: 'في الانتظار',
    scheduled: 'مجدول',
    sending: 'جارٍ الإرسال',
    sent: 'تم الإرسال',
    partial: 'إرسال جزئي',
    failed: 'فشل الإرسال',
    'no-recipients': 'لا توجد أجهزة',
    cancelled: 'ملغي'
  }[status] || status || '—');
}

function renderAudienceOptions() {
  const select = $('#notification-audience');
  if (!select) return;
  const audiences = Array.isArray(state.status?.audiences) ? state.status.audiences : [];
  const current = select.value || 'all-installed';
  select.innerHTML = audiences.map(item => '<option value="' + escapeHtml(item.key) + '">' + escapeHtml(item.label) + ' · ' + Number(item.devices || 0).toLocaleString('ar-AE') + ' جهاز</option>').join('');
  select.value = audiences.some(item => item.key === current) ? current : 'all-installed';
  const selected = audiences.find(item => item.key === select.value);
  const hint = $('#notification-audience-hint');
  if (hint) hint.textContent = selected ? selected.description + ' الأجهزة الظاهرة هنا تُحسب بعد حماية التكرار المؤقتة.' : '';
}

function renderStatus() {
  const s = state.status || {};
  const statusNode = $('#notifications-config-status');
  if (statusNode) {
    statusNode.textContent = s.configured ? 'Push جاهز للإرسال' : 'إعداد Push غير مكتمل';
    statusNode.className = s.configured ? 'notification-status ready' : 'notification-status warning';
  }
  $('#notifications-subscribers') && ($('#notifications-subscribers').textContent = Number(s.subscribers || 0).toLocaleString('ar-AE'));
  $('#notifications-devices') && ($('#notifications-devices').textContent = Number(s.installedDevices || 0).toLocaleString('ar-AE'));
  $('#notifications-campaigns') && ($('#notifications-campaigns').textContent = Number(s.campaigns || 0).toLocaleString('ar-AE'));
  const delivered = state.campaigns.reduce((sum, item) => sum + Number(item.stats?.delivered || 0), 0);
  $('#notifications-delivered') && ($('#notifications-delivered').textContent = delivered.toLocaleString('ar-AE'));
  const scheduled = state.campaigns.filter(item => item.status === 'scheduled').length;
  $('#notifications-scheduled') && ($('#notifications-scheduled').textContent = scheduled.toLocaleString('ar-AE'));
  renderAudienceOptions();
  const sendButton = $('#notification-send-now');
  if (sendButton) {
    sendButton.disabled = !s.configured || Number(s.subscribers || 0) === 0;
    sendButton.title = Number(s.subscribers || 0) === 0
      ? 'ثبّت تطبيق ARABISK على هاتف واحد على الأقل وفعّل الإشعارات أولًا.'
      : '';
  }
}

function renderPreview() {
  const title = $('#notification-title')?.value.trim() || 'عنوان الإشعار';
  const body = $('#notification-body')?.value.trim() || 'نص الإشعار سيظهر هنا على هاتف العميل.';
  const url = $('#notification-url')?.value.trim() || '/';
  $('#notification-preview-title') && ($('#notification-preview-title').textContent = title);
  $('#notification-preview-body') && ($('#notification-preview-body').textContent = body);
  $('#notification-preview-url') && ($('#notification-preview-url').textContent = url);
}

function renderDevices() {
  const body = $('#notifications-devices-body');
  if (!body) return;
  body.innerHTML = state.devices.map(device => {
    const notification = device.subscribed
      ? '<span class="status on">مشترك</span>'
      : '<span class="status pending">غير مفعّل</span>';
    const stateLabel = device.status === 'installed'
      ? '<span class="status on">مثبت</span>'
      : '<span class="status off">تم إلغاء التثبيت</span>';
    const action = device.status === 'installed'
      ? '<button class="small-action danger" type="button" data-uninstall-device="' + escapeHtml(device.id) + '">تسجيل إلغاء التثبيت</button>'
      : '<span class="muted">مؤرشف</span>';
    return '<tr>' +
      '<td><strong>' + escapeHtml(device.platform || 'جهاز') + '</strong><small>' + (device.standalone ? 'تطبيق مثبت' : 'ويب') + '</small></td>' +
      '<td>' + stateLabel + '</td>' +
      '<td>' + notification + '</td>' +
      '<td>' + escapeHtml(formatDate(device.installedAt)) + '</td>' +
      '<td>' + escapeHtml(formatDate(device.lastSeenAt)) + '</td>' +
      '<td class="actions">' + action + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" class="empty">لا توجد أجهزة مسجلة.</td></tr>';
}

function renderCampaigns() {
  const body = $('#notifications-history-body');
  if (!body) return;
  body.innerHTML = state.campaigns.map(item => {
    const stats = item.stats || {};
    const action = item.status === 'scheduled'
      ? '<button class="small-action danger" type="button" data-cancel-notification="' + escapeHtml(item.id) + '">إلغاء الجدولة</button>'
      : '';
    return '<tr>' +
      '<td><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.body) + '</small></td>' +
      '<td><span class="notification-audience">' + escapeHtml(item.audienceLabel || 'كل مستخدمي التطبيق') + '</span></td>' +
      '<td><span class="status ' + (item.status === 'sent' ? 'on' : item.status === 'failed' ? 'off' : 'pending') + '">' + escapeHtml(statusLabel(item.status)) + '</span>' +
      (item.error ? '<small class="notification-error">' + escapeHtml(item.error) + '</small>' : '') +
      '</td>' +
      '<td>' + Number(stats.targeted || 0) + '<small>وصل: ' + Number(stats.delivered || 0) + ' · فشل: ' + Number(stats.failed || 0) + '</small></td>' +
      '<td>' + escapeHtml(item.scheduledAt ? formatDate(item.scheduledAt) : formatDate(item.sentAt || item.createdAt)) + '</td>' +
      '<td class="actions">' + action + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" class="empty">لا توجد إشعارات بعد.</td></tr>';
}

async function load() {
  const data = await request('/api/notifications');
  state.status = data.status || {};
  state.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
  state.devices = Array.isArray(data.devices) ? data.devices : [];
  renderStatus();
  renderDevices();
  renderCampaigns();
  const note = $('#notifications-state');
  if (note) {
    if (!state.status.configured) {
      note.textContent = 'أكمل إعداد مفاتيح VAPID على الخادم أولًا لتفعيل الإرسال.';
    } else if (Number(state.status.subscribers || 0) === 0) {
      note.textContent = 'الإرسال جاهز، لكن لا يوجد حاليًا أي جهاز ARABISK مثبت ومشترك في الإشعارات.';
    } else {
      note.textContent = 'جاهز لإرسال إشعارات Push إلى مستخدمي تطبيق ARABISK المثبت.';
    }
  }
}

function applyTemplate(key) {
  const template = templates[key];
  if (!template) return;
  $('#notification-title').value = template.title;
  $('#notification-body').value = template.body;
  $('#notification-url').value = template.url;
  renderPreview();
}

function getFormData() {
  const title = $('#notification-title').value.trim();
  const body = $('#notification-body').value.trim();
  const url = $('#notification-url').value.trim() || '/';
  const urgency = $('#notification-urgency').value;
  if (!title || !body) throw new Error('اكتب عنوان الإشعار ونصه أولًا.');
  return { title, body, url, urgency, topic: $('#notification-topic').value.trim(), audience: $('#notification-audience')?.value || 'all-installed' };
}

async function sendNow() {
  const data = getFormData();
  const button = $('#notification-send-now');
  button.disabled = true;
  button.textContent = 'جارٍ الإرسال…';
  try {
    const result = await request('/api/notifications/send', { method: 'POST', body: JSON.stringify(data), timeoutMs: 30000 });
    if (result.status === 'no-recipients') {
      $('#notifications-feedback').textContent = 'لم يتم الإرسال: لا يوجد أي جهاز تطبيق مثبت ومشترك في الإشعارات.';
      $('#notifications-feedback').className = 'error';
    } else {
      $('#notifications-feedback').textContent = result.stats?.delivered
        ? 'تم إرسال الإشعار بنجاح إلى الجمهور المحدد.'
        : 'تمت معالجة الحملة.';
      if (Number(result.stats?.suppressed || 0) > 0) $('#notifications-feedback').textContent += ' تم تجاوز ' + Number(result.stats.suppressed).toLocaleString('ar-AE') + ' جهازًا مؤقتًا لمنع التكرار.';
      $('#notifications-feedback').className = result.status === 'failed' ? 'error' : 'success-message';
    }
    await load();
  } finally {
    button.disabled = false;
    button.textContent = 'إرسال الآن';
  }
}

async function schedule() {
  const data = getFormData();
  const value = $('#notification-schedule-at').value;
  if (!value) throw new Error('حدد موعد الإرسال أولًا.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('موعد الإرسال غير صالح.');
  const button = $('#notification-schedule');
  button.disabled = true;
  button.textContent = 'جارٍ الحفظ…';
  try {
    await request('/api/notifications/schedule', {
      method: 'POST',
      body: JSON.stringify({ ...data, scheduleAt: date.toISOString() }),
      timeoutMs: 15000
    });
    $('#notifications-feedback').textContent = 'تمت جدولة الإشعار بنجاح.';
    $('#notifications-feedback').className = 'success-message';
    await load();
  } finally {
    button.disabled = false;
    button.textContent = 'جدولة الإشعار';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-notification-template]').forEach((button) => {
    button.addEventListener('click', () => applyTemplate(button.dataset.notificationTemplate));
  });
  ['#notification-title', '#notification-body', '#notification-url'].forEach((selector) => {
    $(selector)?.addEventListener('input', renderPreview);
  });
  $('#notifications-refresh')?.addEventListener('click', () => load().catch((error) => {
    $('#notifications-feedback').textContent = error.message;
    $('#notifications-feedback').className = 'error';
  }));
  $('#notification-send-now')?.addEventListener('click', () => sendNow().catch((error) => {
    $('#notifications-feedback').textContent = error.message;
    $('#notifications-feedback').className = 'error';
  }));
  $('#notification-schedule')?.addEventListener('click', () => schedule().catch((error) => {
    $('#notifications-feedback').textContent = error.message;
    $('#notifications-feedback').className = 'error';
  }));
  $('#notification-template')?.addEventListener('change', (event) => applyTemplate(event.target.value));
  $('#notification-audience')?.addEventListener('change', renderAudienceOptions);
  $('#notifications-devices-body')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-uninstall-device]');
    if (!button) return;
    if (!window.confirm('تسجيل هذا الجهاز كمُلغى التثبيت؟ سيبقى محفوظًا في السجل ولن يتم حذف بياناته.')) return;
    button.disabled = true;
    try {
      await request('/api/notifications/devices/' + encodeURIComponent(button.dataset.uninstallDevice) + '/uninstall', { method: 'POST' });
      await load();
    } catch (error) {
      $('#notifications-feedback').textContent = error.message;
      $('#notifications-feedback').className = 'error';
      button.disabled = false;
    }
  });
  $('#notifications-history-body')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-cancel-notification]');
    if (!button) return;
    if (!window.confirm('إلغاء جدولة هذا الإشعار؟')) return;
    button.disabled = true;
    try {
      await request('/api/notifications/' + encodeURIComponent(button.dataset.cancelNotification) + '/cancel', { method: 'POST' });
      await load();
    } catch (error) {
      $('#notifications-feedback').textContent = error.message;
      $('#notifications-feedback').className = 'error';
      button.disabled = false;
    }
  });
  renderPreview();
  void load().catch((error) => {
    $('#notifications-feedback').textContent = error.message;
    $('#notifications-feedback').className = 'error';
  });
});
