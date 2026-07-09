import type { NewTask, Task } from '@icasu/db/schema';

import { newRowColumns } from '../../__tests__/support.ts';

// 呼び出し側が渡す `db` は（型の上では）差し替え前の実クライアント。ランタイムでは PGlite に
// モックされるが、型は `@icasu/db/client` の `db` に合わせる。
type Db = (typeof import('@icasu/db/client'))['db'];

// createdBy は notNull だが list/get/put/delete のテストは作成者に関心が無い。FK は無いので
// 任意の uuid でよく、呼び出し側に毎回 createdBy を書かせないためのデフォルトの作成者 id。
const DEFAULT_CREATED_BY = '00000000-0000-0000-0000-000000000000';

/**
 * task を 1 行 seed して返す（tasks ルートのテスト専用）。`.returning()` の先頭は
 * `Task | undefined` なので、呼び出し側で毎回ガードせずに済むよう、ここで存在を保証して返す。
 */
export async function seedTask(
  db: Db,
  values: Partial<NewTask> & { title: string },
): Promise<Task> {
  const { tasks } = await import('@icasu/db/schema');
  // status / priority は DB デフォルトを撤去したため（アプリが値を決める方針）、seed でも埋める。
  // id / version / タイムスタンプはアプリ同様 newRowColumns() で付与する（呼び出し側で上書き可）。
  const [row] = await db
    .insert(tasks)
    .values({
      ...newRowColumns(),
      status: 'todo',
      priority: 'medium',
      ...values,
      createdBy: values.createdBy ?? DEFAULT_CREATED_BY,
    })
    .returning();
  if (!row) {
    throw new Error('failed to seed task');
  }
  return row;
}
