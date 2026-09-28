import crypto from 'node:crypto';
import { createWebPushService } from './web-push-service.js';

const STATE_KEY = 'data/arabisk-notifications-v1.json';
const MAX_CAMPAIGNS = 500;
const MAX_TITLE = 80;
const MAX_BODY = 260;
const MAX_URL = 300;
const MAX_TOPIC = 32;
const SCHEDULE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;
const SEND_CONCURRENCY = 8;
const PUSH_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const AUDIENCE_DEFINITIONS = {
  'all-installed': { label: 'كل مستخدمي التطبيق', description: 'كل الأجهزة المثبتة والمشتركة في الإشعارات.' },
  'new-7d': { label: 'عملاء جدد · 7 أيام', description: 'العملاء الذين ظهروا لأول مرة خلال آخر 7 أيام.' },
  'active-30d': { label: 'عملاء نشطون · 30 يوم', description: 'عملاء لديهم نشاط خلال آخر 30 يومًا.' },
  'dormant-31-90d': { label: 'عملاء خاملون · 31–90 يوم', description: 'عملاء لم ينشطوا منذ 31 إلى 90 يومًا.' },
  'lapsed-90d': { label: 'عملاء غير نشطين · +90 يوم', description: 'عملاء لم ينشطوا منذ أكثر من 90 يومًا.' },
  'repeat-2plus': { label: 'عملاء متكررون · طلبان+', description: 'عملاء لديهم طلبان مكتملان أو أكثر.' },
  'app-members': { label: 'أعضاء التطبيق', description: 'العملاء المرتبطون بعضوية التطبيق.' }
};

class NotificationServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'NotificationServiceError';
    this.status = status;
  }
}

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function createState() {
  return { version: 1, campaigns: [] };
}

function normalizeCampaign(input = {}) {
  const title = clean(input.title, MAX_TITLE);
  const body = clean(input.body, MAX_BODY);
  const url = clean(input.url || '/', MAX_URL) || '/';
  const topic = clean(input.topic || '', MAX_TOPIC);
  const urgency = ['very-low', 'low', 'normal', 'high'].includes(input.urgency) ? input.urgency : 'normal';
  const audience = Object.prototype.hasOwnProperty.call(AUDIENCE_DEFINITIONS, input.audience) ? input.audience : 'all-installed';
  if (!title) throw new NotificationServiceError('عنوان الإشعار مطلوب.');
  if (!body) throw new NotificationServiceError('نص الإشعار مطلوب.');
  if (!/^\/(?!\/)|^https:\/\//i.test(url)) throw new NotificationServiceError('رابط الإشعار يجب أن يكون مسارًا داخليًا أو رابط HTTPS.');
  return { title, body, url, topic, urgency, audience };
}

export function createNotificationService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  pushSubscriptionsRepository,
  notificationDevicesRepository,
  vapidPrivateKey,
  vapidPublicKey,
  vapidSubject,
  customers = [],
  orders = [],
  reservations = []
}) {
  const push = createWebPushService({
    privateKey: vapidPrivateKey,
    publicKey: vapidPublicKey,
    subject: vapidSubject
  });
  let state = createState();
  let lastPersistAt = null;
  let lastPersistOk = storageReady ? null : true;
  const timers = new Map();

  const persist = async () => {
    if (!storageReady) return true;
    try {
      const trimmed = state.campaigns.slice(-MAX_CAMPAIGNS);
      const ok = await writeJson(STATE_KEY, { version: 1, campaigns: trimmed });
      lastPersistOk = ok !== false;
      lastPersistAt = nowIso();
      return ok !== false;
    } catch {
      lastPersistOk = false;
      lastPersistAt = nowIso();
      return false;
    }
  };

  const installedDevices = () =>
    notificationDevicesRepository.all().filter(item => item?.status === 'installed');

  const customerById = new Map(customers.map(customer => [String(customer?.id || ''), customer]));

  const lifecycleFor = customer => {
    const last = Date.parse(customer?.lastActivityAt || '');
    if (!Number.isFinite(last)) return 'new';
    const age = Math.max(0, Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000)));
    if (age <= 30) return 'active';
    if (age <= 90) return 'dormant';
    return 'lapsed';
  };

  const customerMatchesAudience = (customerId, audience) => {
    if (audience === 'all-installed') return true;
    const customer = customerById.get(String(customerId || ''));
    if (!customer) return false;
    if (audience === 'app-members') return customer.appMember === true;
    if (audience === 'repeat-2plus') return Number(customer.orderCount || 0) >= 2;
    if (audience === 'active-30d') return lifecycleFor(customer) === 'active';
    if (audience === 'dormant-31-90d') return lifecycleFor(customer) === 'dormant';
    if (audience === 'lapsed-90d') return lifecycleFor(customer) === 'lapsed';
    if (audience === 'new-7d') {
      const firstSeen = Date.parse(customer.firstSeenAt || '');
      return Number.isFinite(firstSeen) && Date.now() - firstSeen <= 7 * 24 * 60 * 60 * 1000;
    }
    return false;
  };

  const audienceDeviceCounts = () => {
    const subscriptions = installedSubscriptions();
    return Object.keys(AUDIENCE_DEFINITIONS).map(key => ({
      key,
      label: AUDIENCE_DEFINITIONS[key].label,
      description: AUDIENCE_DEFINITIONS[key].description,
      customers: key === 'all-installed' ? customers.length : customers.filter(customer => customerMatchesAudience(customer?.id, key)).length,
      devices: subscriptions.filter(subscription => customerMatchesAudience(subscription.customerId, key)).length
    }));
  };

  const installedSubscriptions = () => {
    const devices = new Map(notificationDevicesRepository.all().map(item => [item.clientId, item]));
    return pushSubscriptionsRepository.all().filter(item => {
      if (item?.contextTag !== 'installed-pwa') return false;
      if (item?.deviceStatus === 'uninstalled') return false;
      if (item?.deliveryStatus === 'unsubscribed' || item?.deliveryStatus === 'unreachable') return false;
      const device = item?.clientId ? devices.get(item.clientId) : null;
      return !device || device.status === 'installed';
    });
  };

  const listDevices = () => {
    const subscriptions = pushSubscriptionsRepository.all();
    return installedDevices().concat(
      notificationDevicesRepository.all().filter(item => item?.status === 'uninstalled')
    ).map(item => {
      const related = subscriptions.find(subscription => subscription.clientId === item.clientId && subscription.contextTag === 'installed-pwa');
      return {
        id: item.id,
        platform: item.platform || 'unknown',
        standalone: item.standalone !== false,
        status: item.status || 'installed',
        customerId: item.customerId || '',
        installedAt: item.installedAt || '',
        lastSeenAt: item.lastSeenAt || '',
        uninstalledAt: item.uninstalledAt || '',
        notificationStatus: related?.deliveryStatus || 'not-enabled',
        subscribed: Boolean(related && related.deliveryStatus === 'active')
      };
    }).sort((a,b) => String(b.lastSeenAt || b.installedAt).localeCompare(String(a.lastSeenAt || a.installedAt)));
  };

  const markDeviceUninstalled = async (id) => {
    const device = notificationDevicesRepository.find(item => item.id === clean(id, 100));
    if (!device) throw new NotificationServiceError('الجهاز غير موجود.', 404);
    const now = nowIso();
    device.status = 'uninstalled';
    device.uninstalledAt = now;
    device.lastSeenAt = device.lastSeenAt || device.installedAt || now;
    const related = pushSubscriptionsRepository.all().filter(item => item.clientId === device.clientId);
    for (const subscription of related) {
      subscription.deviceStatus = 'uninstalled';
      subscription.deliveryStatus = 'uninstalled';
      subscription.updatedAt = now;
    }
    await notificationDevicesRepository.save();
    if (related.length) await pushSubscriptionsRepository.save();
    return { id: device.id, status: device.status, uninstalledAt: device.uninstalledAt };
  };

  const publicList = () => state.campaigns.slice().reverse().map(item => ({
    id: item.id,
    title: item.title,
    body: item.body,
    url: item.url,
    urgency: item.urgency,
    audience: item.audience || 'all-installed',
    audienceLabel: AUDIENCE_DEFINITIONS[item.audience || 'all-installed']?.label || AUDIENCE_DEFINITIONS['all-installed'].label,
    scheduledAt: item.scheduledAt || '',
    createdAt: item.createdAt,
    sentAt: item.sentAt || '',
    status: item.status,
    stats: item.stats || { targeted: 0, delivered: 0, failed: 0, removed: 0 },
    error: item.error || ''
  }));

  async function dispatch(campaign) {
    if (!push.configured) throw new NotificationServiceError('الإشعارات غير مكتملة الإعداد: مفاتيح VAPID غير موجودة على الخادم.', 503);
    if (campaign.status === 'sent' || campaign.status === 'cancelled') return campaign;
    campaign.status = 'sending';
    campaign.error = '';
    campaign.startedAt = nowIso();
    await persist();

    const eligible = installedSubscriptions().filter(subscription => customerMatchesAudience(subscription.customerId, campaign.audience));
    const now = Date.now();
    const subscriptions = eligible.filter(subscription => {
      const lastPushAt = Date.parse(subscription.lastPushAt || '');
      return !Number.isFinite(lastPushAt) || now - lastPushAt >= PUSH_COOLDOWN_MS;
    });
    const stats = { targeted: subscriptions.length, suppressed: Math.max(0, eligible.length - subscriptions.length), delivered: 0, failed: 0, removed: 0 };

    if (subscriptions.length === 0) {
      campaign.stats = stats;
      campaign.status = 'no-recipients';
      campaign.error = 'لا توجد أجهزة تطبيق مثبتة ومشتركة في إشعارات ARABISK وقت الإرسال.';
      campaign.completedAt = nowIso();
      await persist();
      return campaign;
    }

    const queue = subscriptions.slice();

    const worker = async () => {
      while (queue.length) {
        const subscription = queue.shift();
        if (!subscription) return;
        try {
          const result = await push.send(subscription, {
            title: campaign.title,
            body: campaign.body,
            url: campaign.url,
            tag: campaign.topic || `arabisk-${campaign.id.slice(0, 12)}`
          }, {
            ttl: 86400,
            urgency: campaign.urgency,
            topic: campaign.topic
          });
          if (result.ok) {
            stats.delivered += 1;
            subscription.deliveryStatus = 'active';
            subscription.lastDeliveryAt = nowIso();
            subscription.lastPushAt = subscription.lastDeliveryAt;
            subscription.lastDeliveryError = '';
            subscription.updatedAt = nowIso();
          } else if (result.statusCode === 404 || result.statusCode === 410) {
            stats.failed += 1;
            subscription.deliveryStatus = 'unreachable';
            subscription.lastDeliveryError = `Push provider returned ${result.statusCode}; device kept in registry until admin marks it uninstalled.`;
            subscription.updatedAt = nowIso();
          } else {
            stats.failed += 1;
            subscription.lastDeliveryError = `Push provider returned ${result.statusCode || 'unknown'}.`;
            subscription.updatedAt = nowIso();
          }
        } catch {
          stats.failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, Math.max(1, queue.length)) }, () => worker()));
    campaign.stats = stats;
    campaign.sentAt = stats.delivered > 0 ? nowIso() : '';
    campaign.status = stats.delivered > 0 && stats.failed === 0 ? 'sent' : stats.delivered > 0 ? 'partial' : 'failed';
    campaign.error = stats.failed > 0 ? 'تعذر تسليم الإشعار إلى بعض الأجهزة.' : '';
    campaign.completedAt = nowIso();
    await pushSubscriptionsRepository.save();
    await persist();
    return campaign;
  }

  function schedule(campaign) {
    const when = Date.parse(campaign.scheduledAt);
    if (!Number.isFinite(when)) return;
    const remaining = when - Date.now();
    clearTimeout(timers.get(campaign.id));
    const delay = Math.max(0, Math.min(remaining, 2_000_000_000));
    const timer = setTimeout(() => {
      timers.delete(campaign.id);
      if (Date.now() < when) {
        schedule(campaign);
        return;
      }
      void dispatch(campaign).catch(async error => {
        campaign.status = 'failed';
        campaign.error = error.message;
        campaign.completedAt = nowIso();
        await persist();
      });
    }, delay);
    timer.unref?.();
    timers.set(campaign.id, timer);
  }

  async function restore() {
    state = createState();
    if (storageReady) {
      const result = await readJsonWithStatus(STATE_KEY);
      if (!result.ok) {
        lastPersistOk = false;
        throw new NotificationServiceError('تعذر استعادة مركز الإشعارات من التخزين.', 503);
      }
      if (result.found && result.value && Array.isArray(result.value.campaigns)) {
        state.campaigns = result.value.campaigns.slice(-MAX_CAMPAIGNS);
      }
    }
    for (const campaign of state.campaigns) {
      if (campaign.status === 'scheduled' && campaign.scheduledAt) {
        if (Date.parse(campaign.scheduledAt) <= Date.now()) {
          void dispatch(campaign).catch(() => {});
        } else {
          schedule(campaign);
        }
      } else if (campaign.status === 'sending') {
        campaign.status = 'failed';
        campaign.error = 'توقفت عملية الإرسال قبل اكتمالها.';
      }
    }
    await persist();
  }

  async function createAndSend(input, { scheduleAt = '' } = {}) {
    const campaignInput = normalizeCampaign(input);
    let scheduledAt = '';
    if (scheduleAt) {
      const timestamp = Date.parse(scheduleAt);
      if (!Number.isFinite(timestamp)) throw new NotificationServiceError('موعد الإرسال غير صالح.');
      if (timestamp <= Date.now()) throw new NotificationServiceError('موعد الإرسال يجب أن يكون في المستقبل.');
      if (timestamp - Date.now() > SCHEDULE_HORIZON_MS) throw new NotificationServiceError('يمكن جدولة الإشعار حتى 90 يومًا مقدمًا.');
      scheduledAt = new Date(timestamp).toISOString();
    }
    const campaign = {
      id: crypto.randomUUID(),
      ...campaignInput,
      status: scheduledAt ? 'scheduled' : 'queued',
      scheduledAt,
      createdAt: nowIso(),
      sentAt: '',
      error: '',
      stats: { targeted: 0, suppressed: 0, delivered: 0, failed: 0, removed: 0 }
    };
    state.campaigns.push(campaign);
    state.campaigns = state.campaigns.slice(-MAX_CAMPAIGNS);
    if (!(await persist())) throw new NotificationServiceError('تعذر حفظ الإشعار.', 503);

    if (scheduledAt) {
      schedule(campaign);
    } else {
      await dispatch(campaign);
    }
    return campaign;
  }

  async function cancel(id) {
    const campaign = state.campaigns.find(item => item.id === clean(id, 80));
    if (!campaign) throw new NotificationServiceError('الإشعار غير موجود.', 404);
    if (campaign.status !== 'scheduled') throw new NotificationServiceError('يمكن إلغاء الإشعارات المجدولة فقط.', 409);
    clearTimeout(timers.get(campaign.id));
    timers.delete(campaign.id);
    campaign.status = 'cancelled';
    campaign.completedAt = nowIso();
    await persist();
    return campaign;
  }

  async function notifyCustomer(customerId, input = {}) {
    const targetId = clean(customerId, 120);
    if (!targetId || !push.configured) return { targeted: 0, delivered: 0, failed: 0 };

    const title = clean(input.title || 'تحديث من ARABISK', MAX_TITLE);
    const body = clean(input.body || '', MAX_BODY);
    const url = clean(input.url || '/', MAX_URL) || '/';
    const subscriptions = installedSubscriptions().filter(item => String(item.customerId || '') === targetId);
    if (!subscriptions.length || !body) return { targeted: subscriptions.length, delivered: 0, failed: 0 };

    let delivered = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        const result = await push.send(subscription, {
          title, body, url,
          tag: clean(input.tag || 'arabisk-customer-update', 60)
        }, { ttl: 3600, urgency: 'high' });
        if (result.ok) {
          delivered += 1;
          const stamp = nowIso();
          subscription.deliveryStatus = 'active';
          subscription.lastDeliveryAt = stamp;
          subscription.lastPushAt = stamp;
          subscription.lastDeliveryError = '';
          subscription.updatedAt = stamp;
        } else {
          failed += 1;
          subscription.lastDeliveryError = 'Transactional push delivery failed.';
          subscription.updatedAt = nowIso();
        }
      } catch {
        failed += 1;
      }
    }
    if (subscriptions.length) await pushSubscriptionsRepository.save();
    return { targeted: subscriptions.length, delivered, failed };
  }

  return {
    restore,
    notifyCustomer,
    createAndSend,
    cancel,
    getStatus: () => ({
      configured: push.configured,
      audience: 'installed-pwa',
      subscribers: installedSubscriptions().length,
      installedDevices: installedDevices().length,
      campaigns: state.campaigns.length,
      audiences: audienceDeviceCounts(),
      lastPersistAt,
      lastPersistOk
    }),
    list: () => publicList(),
    listDevices,
    markDeviceUninstalled,
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: persist
  };
}
