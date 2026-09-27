const MAX_PUSH_SUBSCRIPTIONS = 10000;

class PushSubscriptionServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PushSubscriptionServiceError';
    this.status = status;
  }
}

export function createPushSubscriptionService({ repository, cleanText, crypto, findCustomerByProfileToken }) {
  const { pushSubscriptions } = repository;

  function parseSubscription(body) {
    const endpoint = cleanText(body?.endpoint, 500);
    const p256dh = cleanText(body?.keys?.p256dh, 200);
    const auth = cleanText(body?.keys?.auth, 100);
    if (!endpoint || !/^https:\/\//i.test(endpoint)) return null;
    if (!p256dh || !auth) return null;
    return { endpoint, p256dh, auth };
  }

  async function saveSubscription(body) {
    const parsed = parseSubscription(body);
    if (!parsed) {
      throw new PushSubscriptionServiceError('A valid push subscription (endpoint and keys) is required.');
    }
    const contextTag = cleanText(body?.contextTag, 40);
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
      if (customerId) existing.customerId = customerId;
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
      customerId,
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

    pushSubscriptions.removeById(existing.id);
    try {
      await pushSubscriptions.save();
    } catch (error) {
      pushSubscriptions.add(existing);
      throw error;
    }

    return { subscribed: false };
  }

  function listSubscriptions() {
    return pushSubscriptions.all();
  }

  return { saveSubscription, removeSubscription, listSubscriptions };
}
