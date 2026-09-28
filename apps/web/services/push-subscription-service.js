const MAX_PUSH_SUBSCRIPTIONS = 10000;

class PushSubscriptionServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PushSubscriptionServiceError';
    this.status = status;
  }
}

export function createPushSubscriptionService({ repository, cleanText, crypto, findCustomerByProfileToken }) {
  const { pushSubscriptions, notificationDevices } = repository;

  function parseSubscription(body) {
    const endpoint = cleanText(body?.endpoint, 500);
    const p256dh = cleanText(body?.keys?.p256dh, 200);
    const auth = cleanText(body?.keys?.auth, 100);
    if (!endpoint || !/^https:\/\//i.test(endpoint)) return null;
    if (!p256dh || !auth) return null;
    return { endpoint, p256dh, auth };
  }

  async function registerDevice(body = {}) {
    const clientId = cleanText(body?.clientId, 100);
    if (!clientId) throw new PushSubscriptionServiceError('clientId is required.', 400);
    const profileToken = cleanText(body?.profileToken, 300);
    const linkedCustomer = profileToken && typeof findCustomerByProfileToken === 'function'
      ? findCustomerByProfileToken(profileToken)
      : null;
    const now = new Date().toISOString();
    const existing = notificationDevices.find(item => item.clientId === clientId);
    const deviceData = {
      platform: cleanText(body?.platform, 80) || 'unknown',
      userAgent: cleanText(body?.userAgent, 240),
      standalone: body?.standalone !== false,
      customerId: linkedCustomer?.id || ''
    };

    if (existing) {
      existing.platform = deviceData.platform || existing.platform;
      existing.userAgent = deviceData.userAgent || existing.userAgent;
      existing.standalone = deviceData.standalone;
      if (deviceData.customerId) existing.customerId = deviceData.customerId;
      existing.lastSeenAt = now;
      existing.status = 'installed';
      existing.uninstalledAt = '';
      await notificationDevices.save();
      const related = pushSubscriptions.filter(item => item.clientId === clientId);
      for (const subscription of related) {
        subscription.deviceStatus = 'installed';
        if (subscription.deliveryStatus === 'uninstalled') subscription.deliveryStatus = 'active';
      }
      if (related.length) await pushSubscriptions.save();
      return { id: existing.id, registered: true };
    }

    const device = {
      id: crypto.randomUUID(),
      clientId,
      ...deviceData,
      status: 'installed',
      installedAt: now,
      lastSeenAt: now,
      uninstalledAt: ''
    };
    notificationDevices.add(device);
    try {
      await notificationDevices.save();
    } catch (error) {
      notificationDevices.removeById(device.id);
      throw error;
    }
    return { id: device.id, registered: true };
  }

  async function saveSubscription(body) {
    const parsed = parseSubscription(body);
    if (!parsed) {
      throw new PushSubscriptionServiceError('A valid push subscription (endpoint and keys) is required.');
    }
    const contextTag = cleanText(body?.contextTag, 40);
    const clientId = cleanText(body?.clientId, 100);
    const profileToken = cleanText(body?.profileToken, 300);
    const linkedCustomer = profileToken && typeof findCustomerByProfileToken === 'function'
      ? findCustomerByProfileToken(profileToken)
      : null;
    const customerId = linkedCustomer?.id || '';
    const now = new Date().toISOString();
    const existing = pushSubscriptions.find(item => item.endpoint === parsed.endpoint);

    if (existing) {
      const before = structuredClone(existing);
      existing.p256dh = parsed.p256dh;
      existing.auth = parsed.auth;
      existing.updatedAt = now;
      if (contextTag) existing.contextTag = contextTag;
      if (clientId) existing.clientId = clientId;
      if (customerId) existing.customerId = customerId;
      existing.deviceStatus = 'installed';
      existing.deliveryStatus = 'active';
      existing.lastDeliveryError = '';
      try {
        await pushSubscriptions.save();
      } catch (error) {
        Object.assign(existing, before);
        throw error;
      }
      return { id: existing.id, subscribed: true };
    }

    if (pushSubscriptions.all().length >= MAX_PUSH_SUBSCRIPTIONS) {
      throw new PushSubscriptionServiceError('Subscription limit reached. Please try again later.', 503);
    }

    const subscription = {
      id: crypto.randomUUID(),
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      contextTag,
      clientId,
      customerId,
      deviceStatus: 'installed',
      deliveryStatus: 'active',
      lastDeliveryAt: '',
      lastPushAt: '',
      lastDeliveryError: '',
      createdAt: now,
      updatedAt: now
    };

    pushSubscriptions.add(subscription);
    try {
      await pushSubscriptions.save();
    } catch (error) {
      pushSubscriptions.removeById(subscription.id);
      throw error;
    }

    return { id: subscription.id, subscribed: true };
  }

  async function removeSubscription(endpointRaw) {
    const endpoint = cleanText(endpointRaw, 500);
    if (!endpoint) throw new PushSubscriptionServiceError('endpoint is required');

    const existing = pushSubscriptions.find(item => item.endpoint === endpoint);
    if (!existing) return { subscribed: false };

    existing.deliveryStatus = 'unsubscribed';
    existing.updatedAt = new Date().toISOString();
    await pushSubscriptions.save();
    return { subscribed: false, preserved: true };
  }

  function listSubscriptions() {
    return pushSubscriptions.all();
  }

  return { registerDevice, saveSubscription, removeSubscription, listSubscriptions };
}
