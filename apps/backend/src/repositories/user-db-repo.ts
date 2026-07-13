import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { and, eq } from 'drizzle-orm';

import type { User } from '../entities/user.ts';

export async function findUserBySub(userSub: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.userSub, userSub));
  return row ? toUser(row) : null;
}

export async function findUser(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
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

/**
 * 次の状態を永続化する。楽観ロックは `WHERE version = expectedVersion` の CAS で掛ける（load→save の間に
 * 別の書き手が版を進める窓を塞ぐ原子バックストップ。負けたら null）。`version` はドメインが決めた絶対値を
 * そのまま書き戻す（DB 側で +1 しない）。可変なのは role のみ（userSub は identity で変えない）。
 */
export async function saveUser(user: User, expectedVersion: number): Promise<User | null> {
  const { id, role, meta } = user;
  const [saved] = await db
    .update(users)
    .set({
      role,
      updatedAt: meta.updatedAt,
      version: meta.version,
    })
    .where(and(eq(users.id, id), eq(users.version, expectedVersion)))
    .returning();
  return saved ? toUser(saved) : null;
}

/** DB 行（フラット）をドメインの User に写す。監査系の列は meta にまとめる（toTask と同じ規約）。 */
function toUser(row: typeof users.$inferSelect): User {
  const { createdAt, updatedAt, version, ...rest } = row;
  return { ...rest, meta: { version, createdAt, updatedAt } };
}
