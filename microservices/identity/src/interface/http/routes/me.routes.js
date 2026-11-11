// HTTP routes – /me (profile)
import { Router } from 'express';
import { z } from 'zod';
import { sendError, handleServiceError } from '../errors.js';
import { authenticate } from '../middleware/authenticate.js';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  // explicitly reject username and password
  username: z.undefined({ invalid_type_error: 'username cannot be updated via this endpoint' }).optional(),
  password: z.undefined({ invalid_type_error: 'use PUT /me/password to change password' }).optional(),
}).refine(data => data.name !== undefined || data.email !== undefined, {
  message: 'at least one of name or email must be provided',
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export function meRouter(userService) {
  const router = Router();

  router.use(authenticate);

  // GET /me
  router.get('/', async (req, res) => {
    try {
      const user = await userService.getMe(req.userId);
      return res.json(user);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // PATCH /me
  router.patch('/', async (req, res) => {
    if (req.body.username !== undefined || req.body.password !== undefined) {
      return sendError(res, 400, 'VALIDATION', 'username and password cannot be updated via this endpoint');
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION', 'validation failed', parsed.error.errors);
    }
    try {
      const user = await userService.updateMe(req.userId, parsed.data, req.requestId);
      return res.json(user);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // PUT /me/password
  router.put('/password', async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION', 'validation failed', parsed.error.errors);
    }
    try {
      await userService.changePassword(req.userId, parsed.data);
      return res.status(204).send();
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // DELETE /me
  router.delete('/', async (req, res) => {
    try {
      await userService.deactivateMe(req.userId, req.requestId);
      res.clearCookie('access_token', { path: '/' });
      return res.status(204).send();
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  return router;
}

