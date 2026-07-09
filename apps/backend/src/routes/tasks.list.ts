import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { desc } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { rowToTaskResponse } from '../wire/task.ts';

// 読み取り系はドメイン層を経由せず drizzle を直書きする（mini-CQRS。詳細は CLAUDE.md）。ワイヤ形だけは
// write と揃えるため rowToTaskResponse で meta ネストに整形する。
export default new Hono().get('/tasks', auth({ for: 'user' }), async (c) => {
  const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  return c.json(rows.map(rowToTaskResponse));
});
