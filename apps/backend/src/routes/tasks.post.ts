import { randomUUID } from 'node:crypto';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { audit } from '../audit.ts';
import { createTask } from '../entities/task.ts';
import { auth } from '../middleware/auth.ts';
import { addTask } from '../repositories/task-db-repo.ts';
import { taskInputSchema, toTaskResponse } from '../wire/task.ts';

export default new Hono().post(
  '/tasks',
  auth({ action: 'task:write' }),
  zValidator('json', taskInputSchema),
  async (c) => {
    const input = c.req.valid('json');

    // create（ドメインで新規状態を決定）→ insert（永続化）の 2 段。id は意図ではなく実行時
    // コンテキストとして注入し、作成者は authZ が解決した User から採る（クライアントに詐称させない）。
    const task = createTask({ ...input, createdBy: c.get('user').id }, { id: randomUUID() });
    const created = await addTask(task);
    audit(c, 'task.created', { target: { type: 'task', id: created.value.id } });
    return c.json(toTaskResponse(created), 201);
  },
);
