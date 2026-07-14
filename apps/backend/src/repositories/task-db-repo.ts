import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { and, eq } from 'drizzle-orm';

import type { Task } from '../entities/task.ts';
import { INITIAL_VERSION, type Persisted, toPersisted } from './persisted.ts';

export async function findTask(id: string): Promise<Persisted<Task> | null> {
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  return existing ? toPersisted(existing) : null;
}

/** 新規 Task を追加する。記録メタデータ（版の起点・タイムスタンプ）はここで打つ。 */
export async function addTask(task: Task): Promise<Persisted<Task>> {
  const now = new Date();
  const [created] = await db
    .insert(tasks)
    .values({
      ...task,
      version: INITIAL_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  // insert が行を返さないのは不変条件違反（到達しない）。回復させず throw。
  if (!created) {
    throw new Error(`failed to insert task: ${task.id}`);
  }
  return toPersisted(created);
}

/**
 * 次の状態を永続化する。楽観ロックは `WHERE version = expectedVersion` の CAS で掛ける —— クライアントが
 * 土台にした版と DB の現在版の一致を判定する唯一の点（負けたら null）。版は CAS を通った書き込みだけが
 * `+1` 進める。
 */
export async function saveTask(
  task: Task,
  expectedVersion: number,
): Promise<Persisted<Task> | null> {
  // createdBy（作成者）は不変なので書き戻さない（万一上流で書き換わっていても永続化させない）。
  const { id, createdBy: _createdBy, ...fields } = task;
  const [saved] = await db
    .update(tasks)
    .set({
      ...fields,
      updatedAt: new Date(),
      version: expectedVersion + 1,
    })
    .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
    .returning();
  return saved ? toPersisted(saved) : null;
}

/** task を 1 件取り除く。取り除けたら true、無ければ false（ルートが 404 に対応づける）。 */
export async function removeTask(id: string): Promise<boolean> {
  const [removed] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  return removed != null;
}
