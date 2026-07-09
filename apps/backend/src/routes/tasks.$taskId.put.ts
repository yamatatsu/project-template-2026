import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { applyUpdate } from '../entities/task.ts';
import { auth } from '../middleware/auth.ts';
import { requireOptimisticLock } from '../middleware/optimistic-lock.ts';
import { findTask, saveTask } from '../repositories/task-db-repo.ts';
import { taskIdParamSchema, taskInputSchema, toTaskResponse } from '../wire/task.ts';

export default new Hono().put(
  '/tasks/:id',
  auth({ for: 'user' }),
  zValidator('param', taskIdParamSchema),
  // 楽観ロック: クライアントが土台にした版を If-Match で要求する（詳細は middleware/optimistic-lock.ts）。
  requireOptimisticLock(),
  zValidator('json', taskInputSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const updates = c.req.valid('json');
    const expectedVersion = c.req.valid('header')['if-match'];
    const now = new Date();

    // 競合は稀なので、クライアントは 412 を受けたら対象 entity を再取得して再送信する（現在版は返さず
    // entity 種別と id のみ）。If-Match 不一致なので 409 ではなく 412 Precondition Failed。
    const conflict = () => c.json({ error: 'Version conflict', entity: 'task', id }, 412);

    const existing = await findTask(id);
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // load → applyUpdate（ドメインで次状態を決定・版チェック）→ save の3段。
    const next = applyUpdate(existing, { updates, expectedVersion }, { now });
    if (!next.ok) {
      return conflict();
    }

    // load→save の窓で別の書き手が割り込んだ場合の原子バックストップ。基底版は逆算させず明示的に渡す。
    const saved = await saveTask(next.value, expectedVersion);
    if (!saved) {
      return conflict();
    }

    return c.json(toTaskResponse(saved));
  },
);
