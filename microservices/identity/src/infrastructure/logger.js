// Infrastructure – Pino JSON logger with requestId support
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.log.level,
  redact: ['req.headers.cookie', 'req.headers.authorization', 'body.password', 'body.currentPassword', 'body.newPassword'],
});

