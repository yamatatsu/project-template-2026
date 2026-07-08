import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { type NewTask, tasks } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { taskIdParamSchema, updateTaskSchema } from './shared/schema.ts';

export default new Hono().put(
  '/tasks/:id',
  zValidator('param', taskIdParamSchema),
  zValidator('json', updateTaskSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const values: Partial<NewTask> = {
      ...input,
      dueDate: input.dueDate == null ? input.dueDate : new Date(input.dueDate),
    };
    const [updated] = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning();
    if (!updated) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json(updated);
  },
);
