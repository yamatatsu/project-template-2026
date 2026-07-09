import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { rowToTaskResponse, taskIdParamSchema } from '../wire/task.ts';

// 読み取り系はドメイン層（entities/repo）を経由せず drizzle を直書きする（mini-CQRS。詳細は CLAUDE.md）。
// ワイヤ形だけは write と揃えるため rowToTaskResponse で meta ネストに整形する。
export default new Hono().get(
  '/tasks/:id',
  auth({ action: 'task:read' }),
  zValidator('param', taskIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json(rowToTaskResponse(task));
  },
);
