// HTTP middleware – authenticate requests via access_token cookie
import jwt from 'jsonwebtoken';
import { config } from '../../../config.js';
import { sendError } from '../errors.js';

export function authenticate(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return sendError(res, 401, 'NOT_AUTHENTICATED', 'authentication required');

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.userId = payload.userId;
    next();
  } catch {
    return sendError(res, 401, 'NOT_AUTHENTICATED', 'invalid or expired token');
  }
}

