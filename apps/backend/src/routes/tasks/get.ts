import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { taskIdParamSchema } from './shared/schema.ts';

export default new Hono().get('/tasks/:id', zValidator('param', taskIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  return c.json(task);
});
