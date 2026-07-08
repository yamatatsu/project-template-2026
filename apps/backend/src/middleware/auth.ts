import { type AuthEnv } from '@icasu/backend-auth';
import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';

import type { AppEnv } from './env.ts';

type Access = 'user' | 'admin';

/**
 * 認可（authZ）。境界の `requireSession`（authN）が載せた session からドメイン User を解決し、
 * `c.set('user')` で注入する。`for: 'admin'` のときは role も検証する。
 *
 * 設定注入を要さない（`db` は静的 import、role 判定は Context 参照のみ）ため、各ルートファイルの
 * ハンドラ定義に静的 import で直接書ける。認証の設定注入は合成点の `requireSession` が担い、
 * ここは「session → users の解決 + RBAC」だけに責務を絞る。
 */
export const auth = (opts: { for: Access }) =>
  // session を読み user を書くので、内部で満たすべき Env は AppEnv & AuthEnv。
  createMiddleware<AppEnv & AuthEnv>(async (c, next) => {
    const { userSub } = c.get('session');

    // JIT プロビジョニング: 別サインアップ導線を持たないため、初回アクセス時に users 行を確保する。
    // 複数の初回リクエストが同時到達しても unique(user_sub) + onConflictDoNothing で重複を吸収し、
    // その後の select で必ず 1 行に収束させる。
    await db.insert(users).values({ userSub }).onConflictDoNothing();
    const [user] = await db.select().from(users).where(eq(users.userSub, userSub));
    // 直前に確保済みなので到達しない。不変条件違反として throw（回復させない）。
    if (!user) {
      throw new Error(`failed to provision user for sub: ${userSub}`);
    }

    // 認証済みだが権限不足は 403（認証欠如の 401 は境界の requireSession が既に弾いている）。
    if (opts.for === 'admin' && user.role !== 'admin') {
      return c.json({ error: 'forbidden' }, 403);
    }

    c.set('user', user);
    await next();
  });
