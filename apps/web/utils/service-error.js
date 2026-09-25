export function sendServiceError(res, error) {
  const status = Number(error?.status);
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 499 ? status : 500;
  const payload = {
    message: safeStatus < 500
      ? String(error?.message || 'Request could not be completed.')
      : 'Internal server error.'
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

export function serviceErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === 'entity.too.large') {
    return sendServiceError(res, {
      status: 413,
      code: 'REQUEST_BODY_TOO_LARGE',
      message: 'Request body is too large.'
    });
  }

  if (error instanceof SyntaxError && error?.status === 400) {
    return sendServiceError(res, {
      status: 400,
      code: 'INVALID_JSON',
      message: 'Invalid JSON request.'
    });
  }

  return sendServiceError(res, error);
}
