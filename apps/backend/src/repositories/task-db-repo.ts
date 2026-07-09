import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { and, eq } from 'drizzle-orm';

import type { Task } from '../entities/task.ts';

export async function findTask(id: string): Promise<Task | null> {
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  return existing ? toTask(existing) : null;
}

/**
 * createTask が組み立てた新規 Task をコレクションに追加する。CAS は不要（追加は成功か例外の二択）
 * なので、生成された行を toTask で写して返す。id・version・監査列はドメインが決めた値をそのまま書く。
 */
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
 * applyUpdate が組み立てた次の状態を永続化する。ドメイン判断は持たず、DB への書き戻しだけを担う。
 * 楽観ロックは `WHERE version = expectedVersion` の CAS で掛ける —— 版チェックは applyUpdate 済みだが、
 * load→save の間に別の書き手が版を進める窓が残るための原子バックストップ（負けたら null）。
 * `version` は applyUpdate が決めた絶対値をそのまま書き戻す（DB 側で +1 しない＝値の決定はアプリに集約）。
 * 前提となる基底版（expectedVersion）は「新版 - 1」と逆算せず**呼び出し側から明示的に受け取る**
 * （+1 という増分規約はドメインの事実であり、repo が知って再現すべきものではないため）。
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

/**
 * task を 1 件コレクションから取り除く。取り除けたら true、無ければ false（ルートが 404 に対応づける）。
 * 削除は楽観ロックを掛けない方針（テンプレ時点では削除の要求が定かでなく、複雑度に見合わないため）。
 */
export async function removeTask(id: string): Promise<boolean> {
  const [removed] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  return removed != null;
}

/** DB 行（フラット）をドメインの Task に写す。監査系の列は meta にまとめる。 */
function toTask(row: typeof tasks.$inferSelect): Task {
  const { createdAt, updatedAt, version, ...rest } = row;
  return { ...rest, meta: { version, createdAt, updatedAt } };
}
