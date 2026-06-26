import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { type NewTask, tasks } from '@icasu/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { createTaskSchema, taskIdParamSchema, updateTaskSchema } from './schema.ts';

/**
 * Tasks CRUDL router.
 *
 * Routes are defined with method chaining so the inferred type flows to the
 * frontend via the Hono RPC client. Do not split this chain into intermediate
 * variables, or the RPC type information will be lost.
 */
export const tasksRoute = new Hono()
  .get('/', async (c) => {
    const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    return c.json(rows);
  })
  .post('/', zValidator('json', createTaskSchema), async (c) => {
    const input = c.req.valid('json');
    const values: NewTask = {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate == null ? input.dueDate : new Date(input.dueDate),
    };
    const [created] = await db.insert(tasks).values(values).returning();
    return c.json(created, 201);
  })
  .get('/:id', zValidator('param', taskIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json(task);
  })
  .put(
    '/:id',
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
  )
  .delete('/:id', zValidator('param', taskIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (!deleted) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json({ success: true });
  });
