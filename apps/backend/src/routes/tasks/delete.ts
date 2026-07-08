import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { taskIdParamSchema } from './shared/schema.ts';

export default new Hono().delete(
  '/tasks/:id',
  zValidator('param', taskIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (!deleted) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json({ success: true });
  },
);
