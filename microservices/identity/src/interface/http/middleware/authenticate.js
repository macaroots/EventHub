// HTTP middleware – authenticate requests via Authorization: Bearer <JWT> (o BFF repassa o token)
import jwt from 'jsonwebtoken';
import { config } from '../../../config.js';
import { sendError } from '../errors.js';

export function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return sendError(res, 401, 'NOT_AUTHENTICATED', 'authentication required');

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.userId = payload.userId;
    next();
  } catch {
    return sendError(res, 401, 'NOT_AUTHENTICATED', 'invalid or expired token');
  }
}
