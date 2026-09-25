export function sendServiceError(res, error) {
  const status = Number.isInteger(Number(error?.status)) ? Number(error.status) : 500;
  const safeStatus = status >= 400 && status <= 499 ? status : 500;
  const payload = {
    message: safeStatus < 500 ? String(error?.message || 'Request could not be completed.') : 'Internal server error.'
  };

  if (safeStatus < 500 && error?.code) {
    payload.code = String(error.code).slice(0, 80);
  }

  if (safeStatus < 500 && error?.meta && typeof error.meta === 'object' && !Array.isArray(error.meta)) {
    Object.assign(payload, error.meta);
  }

  if (safeStatus >= 500) {
    console.error(JSON.stringify({
      event: 'web_service_error',
      requestId: res.locals.requestId || 'unknown',
      status: safeStatus,
      error: String(error?.message || error)
    }));
  }

  return res.status(safeStatus).json(payload);
}
