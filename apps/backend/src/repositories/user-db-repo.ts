import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';

import type { User } from '../entities/user.ts';
import { INITIAL_VERSION, toPersisted } from './shared/index.ts';

// 記録メタデータを読む導線が無い（/me も監査も id/role まで）ので、find は封筒を剥がして
// ドメイン値だけ返す。必要になったら Persisted<User> を返す形に広げる。
export async function findUserBySub(userSub: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.userSub, userSub));
  return row ? toPersisted(row).value : null;
}

/**
 * 新規 User を追加する。並行初回アクセスで重複しうるので `unique(user_sub)` + `onConflictDoNothing` で
 * 吸収する。競合時は「勝った行」を返せないため void とし、正準な行は呼び出し側が読み直して収束させる。
 * 記録メタデータ（版の起点・タイムスタンプ）はここで打つ（users は更新導線が無く CAS も無い）。
 */
export async function addUser(user: User): Promise<void> {
  const now = new Date();
  await db
    .insert(users)
    .values({
      ...user,
      version: INITIAL_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
