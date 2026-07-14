import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { audit } from '../audit.ts';
import { applyUpdate } from '../entities/task.ts';
import { auth } from '../middleware/auth.ts';
import { findTask, saveTask } from '../repositories/task-db-repo.ts';
import { conditionalTaskInputSchema, taskIdParamSchema, toTaskResponse } from '../wire/task.ts';

export default new Hono().put(
  '/tasks/:id',
  auth({ action: 'task:write' }),
  zValidator('param', taskIdParamSchema),
  zValidator('json', conditionalTaskInputSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    // ワイヤはフラット、ドメインは「意図（updates）」と「前提（expectedVersion）」を分けて受ける。
    const { expectedVersion, ...updates } = c.req.valid('json');

    // 競合は稀なので、クライアントは 409 を受けたら対象 entity を再取得して再送信する（現在版は返さず
    // entity 種別と id のみ）。
    const conflict = () => c.json({ error: 'Version conflict', entity: 'task', id }, 409);

    const existing = await findTask(id);
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // load → applyUpdate（ドメインで次状態を決定）→ save の3段。版の一致判定は saveTask の CAS が
    // 一手に担う（ドメインは版を知らない。詳細は docs/specs/optimistic-lock.md）。
    const next = applyUpdate(existing.value, updates);
    const saved = await saveTask(next, expectedVersion);
    if (!saved) {
      return conflict();
    }

    // 版と status の遷移だけを残す。本文（title 等）はユーザーが書いた内容なので証跡に写さない。
    audit(c, 'task.updated', {
      target: { type: 'task', id },
      detail: {
        fromVersion: existing.version,
        toVersion: saved.version,
        fromStatus: existing.value.status,
        toStatus: saved.value.status,
      },
    });
    return c.json(toTaskResponse(saved));
  },
);
