const PUBLIC_ERROR_META_KEYS = new Set(['id', 'reservationId']);

function safeLogMessage(error) {
  const raw = String(error?.message || error || 'Unknown error');
  return raw
    .replace(/(password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/(https?:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@')
    .slice(0, 240);
}

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
    for (const key of PUBLIC_ERROR_META_KEYS) {
      if (Object.prototype.hasOwnProperty.call(error.meta, key)) payload[key] = String(error.meta[key]).slice(0, 120);
    }
  }

  if (safeStatus >= 500) {
    console.error(JSON.stringify({
      event: 'web_service_error',
      requestId: res.locals.requestId || 'unknown',
      status: safeStatus,
      error: safeLogMessage(error)
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
