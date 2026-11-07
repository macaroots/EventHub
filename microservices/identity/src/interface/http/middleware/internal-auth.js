// HTTP middleware – protect internal routes with X-Internal-Token header
import { config } from '../../../config.js';
import { sendError } from '../errors.js';

export function internalAuth(req, res, next) {
  const token = req.headers['x-internal-token'];
  if (!token || token !== config.internalToken) {
    return sendError(res, 401, 'UNAUTHORIZED', 'invalid or missing X-Internal-Token');
  }
  next();
}

