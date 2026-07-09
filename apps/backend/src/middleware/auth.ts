import { randomUUID } from 'node:crypto';

import { type AuthEnv } from '@icasu/backend-auth';
import { createMiddleware } from 'hono/factory';

import { type User, createUser } from '../entities/user.ts';
import { addUser, findUserBySub } from '../repositories/user-db-repo.ts';
import type { AppEnv } from './env.ts';

type Access = 'user' | 'admin';

/**
 * 認可（authZ）。境界の `requireSession`（authN）が載せた session からドメイン User を解決し、
 * `c.set('user')` で注入する。`for: 'admin'` のときは role も検証する。
 *
 * 設定注入を要さない（`db` は repo 経由の静的依存、role 判定は Context 参照のみ）ため、各ルートファイルの
 * ハンドラ定義に静的 import で直接書ける。認証の設定注入は合成点の `requireSession` が担い、
 * ここは「session → users の解決 + RBAC」だけに責務を絞る。
 */
export const auth = (opts: { for: Access }) =>
  // session を読み user を書くので、内部で満たすべき Env は AppEnv & AuthEnv。
  createMiddleware<AppEnv & AuthEnv>(async (c, next) => {
    const { userSub } = c.get('session');

    const user = await resolveUser(userSub);

    // 認証済みだが権限不足は 403（認証欠如の 401 は境界の requireSession が既に弾いている）。
    // これはアプリ層の認可判断（HTTP 403 への対応づけ）なので、ドメインではなくここに置く。
    if (opts.for === 'admin' && user.role !== 'admin') {
      return c.json({ error: 'forbidden' }, 403);
    }

    c.set('user', user);
    await next();
  });

/**
 * session の identity（userSub）からドメイン User を解決する。別サインアップ導線を持たないため、初回
 * アクセス時は JIT で 1 行確保する（create → add）。並行初回は add 側の onConflictDoNothing で吸収し、
 * 追加後に読み直して「勝った行」に必ず収束させる。id・now は実行時コンテキストとして注入する。
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
  return provisioned;
}
