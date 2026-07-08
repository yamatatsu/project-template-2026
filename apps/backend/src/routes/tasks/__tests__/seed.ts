import type { NewTask, Task } from '@icasu/db/schema';

// 呼び出し側が渡す `db` は（型の上では）差し替え前の実クライアント。ランタイムでは PGlite に
// モックされるが、型は `@icasu/db/client` の `db` に合わせる。
type Db = (typeof import('@icasu/db/client'))['db'];

/**
 * task を 1 行 seed して返す（tasks ルートのテスト専用）。`.returning()` の先頭は
 * `Task | undefined` なので、呼び出し側で毎回ガードせずに済むよう、ここで存在を保証して返す。
 */
export async function seedTask(
  db: Db,
  values: Partial<NewTask> & { title: string },
): Promise<Task> {
  const { tasks } = await import('@icasu/db/schema');
  const [row] = await db.insert(tasks).values(values).returning();
  if (!row) {
    throw new Error('failed to seed task');
  }
  return row;
}
