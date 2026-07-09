import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { removeTask } from '../repositories/task-db-repo.ts';
import { taskIdParamSchema } from '../wire/task.ts';

export default new Hono().delete(
  '/tasks/:id',
  auth({ for: 'user' }),
  zValidator('param', taskIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const removed = await removeTask(id);
    if (!removed) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json({ success: true });
  },
);
