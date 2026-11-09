// Express application factory – wires middleware and routes.
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { config } from '../config.js';
import { requestIdMiddleware } from './http/middleware/request-id.js';
import { authRouter } from './http/routes/auth.routes.js';
import { meRouter } from './http/routes/me.routes.js';
import { internalRouter } from './http/routes/internal.routes.js';
import { logger } from '../infrastructure/logger.js';

export function createApp(userService) {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
  }));

  // Body parsing (limit 10kb)
  app.use(express.json({ limit: '10kb' }));

  // Request ID propagation
  app.use(requestIdMiddleware);

  // HTTP access logging (no cookies, no tokens)
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url, requestId: req.requestId }, 'incoming request');
    next();
  });

  // Rate limiters
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'too many requests, slow down' } }),
  });

  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'too many requests, slow down' } }),
  });

  // Routes
  app.use('/auth', authLimiter, authRouter(userService));
  app.use('/me/password', passwordLimiter); // applied before meRouter so the limiter runs first
  app.use('/me', meRouter(userService));
  app.use('/internal', internalRouter(userService));

  // Health
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // 404
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'route not found' } }));

  // Global error handler (catches synchronous errors thrown by route handlers)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'internal server error' } });
  });

  return app;
}

