import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';

import type { User } from '../entities/user.ts';

export async function findUserBySub(userSub: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.userSub, userSub));
  return row ? toUser(row) : null;
}

/**
 * createUser が組み立てた新規 User を追加する。別サインアップ導線を持たない JIT プロビジョニングでは複数の
 * 初回リクエストが同時到達しうるので、`unique(user_sub)` + `onConflictDoNothing` で重複を吸収する
 * （負け側は黙って捨てられる）。競合時は insert が行を返さず「勝った行」も分からないため、
 * add は成否を返さず void とし、正準な行は呼び出し側が `findUserBySub` で読み直して収束させる。
 */
export async function addUser(user: User): Promise<void> {
  const { id, userSub, role, meta } = user;
  await db
    .insert(users)
    .values({
      id,
      userSub,
      role,
      version: meta.version,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    })
    .onConflictDoNothing();
}

/** DB 行（フラット）をドメインの User に写す。監査系の列は meta にまとめる（toTask と同じ規約）。 */
function toUser(row: typeof users.$inferSelect): User {
  const { createdAt, updatedAt, version, ...rest } = row;
  return { ...rest, meta: { version, createdAt, updatedAt } };
}
