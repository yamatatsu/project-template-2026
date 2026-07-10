import { randomUUID } from 'node:crypto';

import { type AuthEnv } from '@icasu/backend-auth';
import { appendRequestKeys } from '@icasu/logger';
import { createMiddleware } from 'hono/factory';

import { auditWithActor } from '../audit.ts';
import { type Action, can } from '../authorization.ts';
import { type User, createUser } from '../entities/user.ts';
import { addUser, findUserBySub } from '../repositories/user-db-repo.ts';
import type { AppEnv } from './env.ts';

/**
 * 認可（authZ）。境界の `requireSession`（authN）が載せた session からドメイン User を解決し、
 * `c.set('user')` で注入する。`action` 指定時は Permission-based RBAC で判定する（省略時は解決のみ）。
 * 責務は「session → users の解決 + RBAC」まで。詳細は apps/backend/CLAUDE.md「認証・認可」。
 */
export const auth = (opts: { action?: Action } = {}) =>
  // session を読み user を書くので、内部で満たすべき Env は AppEnv & AuthEnv。
  createMiddleware<AppEnv & AuthEnv>(async (c, next) => {
    const { userSub } = c.get('session');

    const user = await resolveUser(userSub);

    // requireSession は role を知らないので、解決できたここで足す。
    appendRequestKeys({ role: user.role });

    // 認証済みだが権限不足は 403（認証欠如の 401 は境界の requireSession が弾く）。
    if (opts.action && !can(user.role, opts.action)) {
      // 権限の無い操作の試行は不正アクセスの兆候。403 を返すだけでなく証跡に残す。
      auditWithActor('authz.denied', user, {
        outcome: 'failure',
        reason: 'missing-permission',
        detail: { requiredAction: opts.action },
      });
      return c.json({ error: 'forbidden' }, 403);
    }

    c.set('user', user);
    await next();
  });

/**
 * session の identity（userSub）からドメイン User を解決する。初回アクセス時は JIT で 1 行確保する
 * （create → add）。並行初回は add 側の onConflictDoNothing で吸収し、追加後に読み直して収束させる。
 */
async function resolveUser(userSub: string): Promise<User> {
  const existing = await findUserBySub(userSub);
  if (existing) {
    return existing;
  }

  await addUser(createUser({ userSub }, { id: randomUUID(), now: new Date() }));
  const provisioned = await findUserBySub(userSub);
  // 直前に確保済みなので到達しない。不変条件違反として throw（回復させない）。
  if (!provisioned) {
    throw new Error(`failed to provision user for sub: ${userSub}`);
  }

  // アカウントが存在し始めた瞬間の記録。並行初回アクセスでは両方がこの枝を通り、同じ userSub に
  // 対して 2 件出ることがある（行は unique(user_sub) で 1 本に収束するので実害はない）。
  auditWithActor('user.provisioned', provisioned, {
    target: { type: 'user', id: provisioned.id },
  });
  return provisioned;
}
