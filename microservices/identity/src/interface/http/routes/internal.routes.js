// HTTP routes – /internal/users (service-to-service)
import { Router } from 'express';
import { z } from 'zod';
import { sendError, handleServiceError } from '../errors.js';
import { internalAuth } from '../middleware/internal-auth.js';

const batchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export function internalRouter(userService) {
  const router = Router();

  router.use(internalAuth);

  // GET /internal/users/:id
  router.get('/users/:id', async (req, res) => {
    try {
      const user = await userService.getInternalById(req.params.id);
      return res.json(user);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // GET /internal/users?email=
  router.get('/users', async (req, res) => {
    const email = req.query.email;
    if (!email) return sendError(res, 400, 'VALIDATION', 'email query parameter is required');
    try {
      const users = await userService.findInternalByEmail(email);
      return res.json(users);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  // POST /internal/users/batch
  router.post('/users/batch', async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION', 'validation failed', parsed.error.errors);
    }
    try {
      const users = await userService.findInternalByIds(parsed.data.ids);
      return res.json(users);
    } catch (err) {
      return handleServiceError(err, res);
    }
  });

  return router;
}

