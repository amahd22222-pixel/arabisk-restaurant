export function registerRevenueRoutes(app, { service, requireAdminApiKey, analyticsRateLimit }) {
  const {
    createCampaignDraft,
    executeAbandonedCartRecovery,
    executeInactiveCustomerRecovery,
    executeReturningCustomerRecovery,
    updateCampaignOutcome,
    updateCampaignTask,
    getCampaignActivity,
    recordEvent,
    getRecoveryCart,
    buildSummary,
    customerSegments,
    customer360
  } = service;

  app.post('/api/revenue/campaign-drafts', requireAdminApiKey, (req, res) => {
    const draft = createCampaignDraft(req.body || {});
    if (!draft) return res.status(404).json({ message: 'Revenue opportunity not found.' });
    return res.status(201).json(draft);
  });

  app.post('/api/revenue/abandoned-carts/:reference/execute', requireAdminApiKey, (req, res) => {
    const result = executeAbandonedCartRecovery(req.params.reference);
    if (!result) return res.status(404).json({ message: 'Abandoned cart opportunity not found.' });
    if (result.error === 'CART_SNAPSHOT_UNAVAILABLE') {
      return res.status(409).json({ message: 'لا يمكن إنشاء رابط استرجاع لهذه السلة القديمة لأن تفاصيل السلة لم تكن مسجلة.' });
    }
    const campaign = result.campaign;
    return res.status(result.reused ? 200 : 201).json({
      ok: true,
      reused: Boolean(result.reused),
      campaignId: campaign.id,
      recoveryToken: campaign.recoveryToken,
      recoveryPath: campaign.recoveryPath,
      recoveryExpiresAt: campaign.recoveryExpiresAt,
      cartValue: campaign.potentialValue
    });
  });

  app.post('/api/revenue/returning-customers/:reference/execute', requireAdminApiKey, (req, res) => {
    const result = executeReturningCustomerRecovery(req.params.reference);
    if (!result) return res.status(404).json({ message: 'Returning customer opportunity not found.' });
    if (result.error === 'CART_SNAPSHOT_UNAVAILABLE') {
      return res.status(409).json({ message: 'لا يمكن إنشاء رابط إعادة الطلب لأن آخر طلب للعميل لا يحتوي على أصناف قابلة للاسترجاع.' });
    }
    const campaign = result.campaign;
    return res.status(result.reused ? 200 : 201).json({
      ok: true,
      reused: Boolean(result.reused),
      campaignId: campaign.id,
      recoveryToken: campaign.recoveryToken,
      recoveryPath: campaign.recoveryPath,
      recoveryExpiresAt: campaign.recoveryExpiresAt,
      cartValue: campaign.potentialValue
    });
  });

  app.post('/api/revenue/inactive-customers/:reference/execute', requireAdminApiKey, (req, res) => {
    const result = executeInactiveCustomerRecovery(req.params.reference);
    if (!result) return res.status(404).json({ message: 'Inactive customer opportunity not found.' });
    if (result.error === 'CART_SNAPSHOT_UNAVAILABLE') {
      return res.status(409).json({ message: 'لا يمكن إنشاء رابط إعادة الطلب لأن آخر طلب للعميل لا يحتوي على أصناف قابلة للاسترجاع.' });
    }
    const campaign = result.campaign;
    return res.status(result.reused ? 200 : 201).json({
      ok: true,
      reused: Boolean(result.reused),
      campaignId: campaign.id,
      recoveryToken: campaign.recoveryToken,
      recoveryPath: campaign.recoveryPath,
      recoveryExpiresAt: campaign.recoveryExpiresAt,
      cartValue: campaign.potentialValue
    });
  });

  app.post('/api/revenue/campaigns/:id/outcome', requireAdminApiKey, (req, res) => {
    const updated = updateCampaignOutcome(req.params.id, req.body || {});
    if (!updated) return res.status(400).json({ message: 'Invalid campaign or outcome.' });
    return res.json(updated);
  });

  app.post('/api/revenue/campaigns/:id/task', requireAdminApiKey, (req, res) => {
    const updated = updateCampaignTask(req.params.id, req.body || {});
    if (!updated) return res.status(400).json({ message: 'Invalid campaign task.' });
    return res.json(updated);
  });

  app.get('/api/revenue/campaigns/:id/activity', requireAdminApiKey, (req, res) => {
    const activity = getCampaignActivity(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Campaign not found.' });
    return res.json(activity);
  });

  app.post('/api/events', analyticsRateLimit, (req, res) => {
    const event = recordEvent(req.body || {});
    if (!event) return res.status(400).json({ message: 'Unsupported event.' });
    return res.status(202).json({ accepted: true, id: event.id });
  });

  app.get('/api/revenue/recovery/:token', (req, res) => {
    const result = getRecoveryCart(req.params.token);
    if (!result || result.error === 'NOT_FOUND') return res.status(404).json({ message: 'رابط الاسترجاع غير صالح.' });
    if (result.error === 'ALREADY_RECOVERED') return res.status(410).json({ message: 'تم استخدام رابط استرجاع السلة بالفعل.' });
    if (result.error === 'ITEMS_UNAVAILABLE') return res.status(410).json({ message: 'لم تعد أصناف السلة متاحة.' });
    if (result.error === 'EXPIRED') return res.status(410).json({ message: 'انتهت صلاحية رابط استرجاع السلة.' });
    return res.json(result);
  });

  app.get('/api/revenue/summary', requireAdminApiKey, (_req, res) => res.json(buildSummary()));
  app.get('/api/revenue/customer-segments', requireAdminApiKey, (_req, res) => res.json({ generatedAt: new Date().toISOString(), segments: customerSegments() }));

  app.get('/api/revenue/customers/:id/360', requireAdminApiKey, (req, res) => { const profile = customer360(req.params.id); if (!profile) return res.status(404).json({ message: 'Customer not found.' }); return res.json(profile); });


}
