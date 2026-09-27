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
  if (!title) throw new NotificationServiceError('عنوان الإشعار مطلوب.');
  if (!body) throw new NotificationServiceError('نص الإشعار مطلوب.');
  if (!/^\/(?!\/)|^https:\/\//i.test(url)) throw new NotificationServiceError('رابط الإشعار يجب أن يكون مسارًا داخليًا أو رابط HTTPS.');
  return { title, body, url, topic, urgency };
}

export function createNotificationService({
  readJsonWithStatus,
  writeJson,
  storageReady,
  pushSubscriptionsRepository,
  vapidPrivateKey,
  vapidPublicKey,
  vapidSubject
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

  const installedSubscriptions = () =>
    pushSubscriptionsRepository.all().filter(item => item?.contextTag === 'installed-pwa');

  const publicList = () => state.campaigns.slice().reverse().map(item => ({
    id: item.id,
    title: item.title,
    body: item.body,
    url: item.url,
    urgency: item.urgency,
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

    const subscriptions = installedSubscriptions();
    const stats = { targeted: subscriptions.length, delivered: 0, failed: 0, removed: 0 };

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
          } else if (result.statusCode === 404 || result.statusCode === 410) {
            stats.removed += 1;
            pushSubscriptionsRepository.removeById(subscription.id);
          } else {
            stats.failed += 1;
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
    if (stats.removed > 0) await pushSubscriptionsRepository.save();
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
      audience: 'installed-pwa',
      status: scheduledAt ? 'scheduled' : 'queued',
      scheduledAt,
      createdAt: nowIso(),
      sentAt: '',
      error: '',
      stats: { targeted: 0, delivered: 0, failed: 0, removed: 0 }
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

  return {
    restore,
    createAndSend,
    cancel,
    getStatus: () => ({
      configured: push.configured,
      audience: 'installed-pwa',
      subscribers: installedSubscriptions().length,
      campaigns: state.campaigns.length,
      lastPersistAt,
      lastPersistOk
    }),
    list: () => publicList(),
    persistenceStatus: () => ({ lastPersistAt, lastPersistOk }),
    flushPersistence: persist
  };
}
