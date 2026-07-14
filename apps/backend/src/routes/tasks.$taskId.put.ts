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
    // ワイヤはフラット、ドメインの Command は「意図（updates）と前提（expectedVersion）」に分かれる。
    const { expectedVersion, ...updates } = c.req.valid('json');
    const now = new Date();

    // 競合は稀なので、クライアントは 409 を受けたら対象 entity を再取得して再送信する（現在版は返さず
    // entity 種別と id のみ）。
    const conflict = () => c.json({ error: 'Version conflict', entity: 'task', id }, 409);

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

    // 版と status の遷移だけを残す。本文（title 等）はユーザーが書いた内容なので証跡に写さない。
    audit(c, 'task.updated', {
      target: { type: 'task', id },
      detail: {
        fromVersion: existing.meta.version,
        toVersion: saved.meta.version,
        fromStatus: existing.status,
        toStatus: saved.status,
      },
    });
    return c.json(toTaskResponse(saved));
  },
);
