// Shared HTTP error helper
export function sendError(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

export function handleServiceError(err, res) {
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message = status === 500 ? 'internal server error' : err.message;
  if (status === 500) {
    // log internally but never leak stack trace
    console.error(err);
  }

  // Map pg unique-violation to 409
  if (err.code === '23505') {
    const detail = err.detail ?? '';
    if (detail.includes('username')) return sendError(res, 409, 'USERNAME_TAKEN', 'username already exists');
    if (detail.includes('email')) return sendError(res, 409, 'EMAIL_TAKEN', 'email already exists');
    return sendError(res, 409, 'DUPLICATE', 'resource already exists');
  }

  return sendError(res, status, code, message);
}

