// HTTP routes – /auth/*
import { Router } from 'express';
import { z } from 'zod';
import { sendError, handleServiceError } from '../errors.js';

const registerSchema = z.object({
  username: z.string().regex(/^[a-z0-9_.-]{3,30}$/, 'username must be 3-30 lowercase chars (a-z0-9_.-）'),
  email: z.string().email(),
  password: z.string().min(8),
}).refine(data => data.username !== data.email.toLowerCase(), {
  message: 'username must be different from email',
  path: ['username'],
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

  return router;
}
