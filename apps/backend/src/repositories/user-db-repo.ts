import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';

import type { User } from '../entities/user.ts';

export async function findUserBySub(userSub: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.userSub, userSub));
  return row ? toUser(row) : null;
}

/**
 * 新規 User を追加する。並行初回アクセスで重複しうるので `unique(user_sub)` + `onConflictDoNothing` で
 * 吸収する。競合時は「勝った行」を返せないため void とし、正準な行は呼び出し側が読み直して収束させる。
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
