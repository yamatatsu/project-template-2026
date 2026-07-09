import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { and, eq } from 'drizzle-orm';

import type { Task } from '../entities/task.ts';

export async function findTask(id: string): Promise<Task | null> {
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  return existing ? toTask(existing) : null;
}

/** 新規 Task を追加する。id・version・監査列はドメインが決めた値をそのまま書く。 */
export async function addTask(task: Task): Promise<Task> {
  const { id, title, description, status, priority, dueDate, createdBy, meta } = task;
  const [created] = await db
    .insert(tasks)
    .values({
      id,
      title,
      description,
      status,
      priority,
      dueDate,
      createdBy,
      version: meta.version,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    })
    .returning();
  // insert が行を返さないのは不変条件違反（到達しない）。回復させず throw。
  if (!created) {
    throw new Error(`failed to insert task: ${id}`);
  }
  return toTask(created);
}

/**
 * 次の状態を永続化する。楽観ロックは `WHERE version = expectedVersion` の CAS で掛ける —— load→save の
 * 間に別の書き手が版を進める窓を塞ぐ原子バックストップ（負けたら null）。`version` はドメインが決めた
 * 絶対値をそのまま書き戻す（DB 側で +1 しない）。
 */
export async function saveTask(task: Task, expectedVersion: number): Promise<Task | null> {
  const { id, title, description, status, priority, dueDate, meta } = task;
  const [saved] = await db
    .update(tasks)
    .set({
      title,
      description,
      status,
      priority,
      dueDate,
      updatedAt: meta.updatedAt,
      version: meta.version,
    })
    .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
    .returning();
  return saved ? toTask(saved) : null;
}

/** task を 1 件取り除く。取り除けたら true、無ければ false（ルートが 404 に対応づける）。 */
export async function removeTask(id: string): Promise<boolean> {
  const [removed] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  return removed != null;
}

/** DB 行（フラット）をドメインの Task に写す。監査系の列は meta にまとめる。 */
function toTask(row: typeof tasks.$inferSelect): Task {
  const { createdAt, updatedAt, version, ...rest } = row;
  return { ...rest, meta: { version, createdAt, updatedAt } };
}
