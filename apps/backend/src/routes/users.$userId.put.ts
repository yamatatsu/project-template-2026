import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import { audit } from '../audit.ts';
import { applyRoleChange } from '../entities/user.ts';
import { auth } from '../middleware/auth.ts';
import { requireOptimisticLock } from '../middleware/optimistic-lock.ts';
import { findUser, saveUser } from '../repositories/user-db-repo.ts';
import { toUserResponse, userIdParamSchema, userInputSchema } from '../wire/user.ts';

// ユーザー管理は admin 限定。可変なのは role のみ（新規登録は JIT・削除は非対応）。
export default new Hono().put(
  '/users/:id',
  auth({ action: 'user:write' }),
  zValidator('param', userIdParamSchema),
  // 楽観ロック: クライアントが土台にした版を If-Match で要求する（詳細は middleware/optimistic-lock.ts）。
  requireOptimisticLock(),
  zValidator('json', userInputSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const expectedVersion = c.req.valid('header')['if-match'];
    const actorUserId = c.get('user').id;
    const now = new Date();

    // 競合は稀なので、クライアントは 412 を受けたら対象 entity を再取得して再送信する（現在版は返さず
    // entity 種別と id のみ）。If-Match 不一致なので 409 ではなく 412 Precondition Failed。
    const conflict = () => c.json({ error: 'Version conflict', entity: 'user', id }, 412);

    const existing = await findUser(id);
    if (!existing) {
      return c.json({ error: 'User not found' }, 404);
    }

    // load → applyRoleChange（ドメインで次状態を決定・版チェック・自己降格ガード）→ save の3段。
    const next = applyRoleChange(existing, { role, expectedVersion, actorUserId }, { now });
    if (!next.ok) {
      // 自己降格は業務ルール違反なので 403。版競合は precondition 不成立なので 412。
      return next.error.type === 'self-demotion-forbidden'
        ? c.json({ error: 'forbidden', reason: 'self-demotion' }, 403)
        : conflict();
    }

    // load→save の窓で別の書き手が割り込んだ場合の原子バックストップ。基底版は逆算させず明示的に渡す。
    const saved = await saveUser(next.value, expectedVersion);
    if (!saved) {
      return conflict();
    }

    // 版と role の遷移だけを残す（task.updated が版と status を残すのと同じ粒度）。
    audit(c, 'user.role_changed', {
      target: { type: 'user', id },
      detail: {
        fromVersion: existing.meta.version,
        toVersion: saved.meta.version,
        fromRole: existing.role,
        toRole: saved.role,
      },
    });
    return c.json(toUserResponse(saved));
  },
);
