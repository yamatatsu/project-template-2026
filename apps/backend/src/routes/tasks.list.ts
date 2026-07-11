import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { count, desc } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { rowToTaskResponse, taskListQuerySchema } from '../wire/task.ts';
import type { TaskListResponse } from '../wire/task.ts';

// 読み取り系はドメイン層を経由せず drizzle を直書きする（mini-CQRS。詳細は CLAUDE.md）。ワイヤ形だけは
// write と揃えるため rowToTaskResponse で meta ネストに整形する。
export default new Hono().get(
  '/tasks',
  auth({ action: 'task:read' }),
  zValidator('query', taskListQuerySchema),
  async (c) => {
    const { page, pageSize } = c.req.valid('query');
    const { rows, total } = await findManyTasks(page, pageSize);
    const body: TaskListResponse = {
      items: rows.map(rowToTaskResponse),
      total,
    };
    return c.json(body);
  },
);

async function findManyTasks(
  page: number,
  pageSize: number,
): Promise<{ rows: (typeof tasks.$inferSelect)[]; total: number }> {
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(tasks)
      // createdAt は同値になり得る（一括投入など）ので id で全順序にし、ページ間の重複・欠落を防ぐ。
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(tasks),
  ]);
  return {
    rows,
    total: totalRow?.total ?? 0,
  };
}
