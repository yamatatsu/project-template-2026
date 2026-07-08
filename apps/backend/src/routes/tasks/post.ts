import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { type NewTask, tasks } from '@icasu/db/schema';
import { Hono } from 'hono';

import { auth } from '../../middleware/auth.ts';
import { createTaskSchema } from './shared/schema.ts';

export default new Hono().post(
  '/tasks',
  auth({ for: 'user' }),
  zValidator('json', createTaskSchema),
  async (c) => {
    const input = c.req.valid('json');
    const values: NewTask = {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate == null ? input.dueDate : new Date(input.dueDate),
      // 作成者は入力ではなく authZ が解決した User から採る（クライアントに詐称させない）。
      createdBy: c.get('user').id,
    };
    const [created] = await db.insert(tasks).values(values).returning();
    return c.json(created, 201);
  },
);
