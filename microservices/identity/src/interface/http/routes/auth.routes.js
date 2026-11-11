// HTTP routes – /auth/*
import { Router } from 'express';
import { z } from 'zod';
import { sendError, handleServiceError } from '../errors.js';
import { authenticate } from '../middleware/authenticate.js';
import { config } from '../../../config.js';

const registerSchema = z.object({
  name: z.string().min(1).max(120),
  username: z.string().regex(/^[a-z0-9_.-]{3,30}$/, 'username must be 3-30 lowercase chars (a-z0-9_.-）'),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function authRouter(userService) {
  const router = Router();

  // POST /auth/register
  router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION', 'validation failed', parsed.error.errors);
    }
    try {
      const user = await userService.register(parsed.data, req.requestId);
      return res.status(201).json(user);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // POST /auth/login
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION', 'validation failed', parsed.error.errors);
    }
    try {
      const { token, expiresIn } = await userService.login(parsed.data);
      return res.json({ token, expiresIn });
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // POST /auth/logout
  router.post('/logout', authenticate, (req, res) => {
    res.clearCookie('access_token', { path: '/' });
    return res.status(204).send();
  });

  return router;
}

