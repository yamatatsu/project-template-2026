import type { Task as TaskRow } from '@icasu/db/schema';
import { z } from 'zod';

import type { Task, TaskPriority, TaskStatus } from '../entities/task.ts';
import { taskPriorityValues, taskStatusValues } from '../entities/task.ts';

// task がワイヤを越える形（入力＝request / 出力＝response）を 1 feature 1 ファイルにまとめる。設計方針は
// apps/backend/CLAUDE.md「入力検証と値の所有」「読み取り系の方針」を参照。

// ── リクエスト（入力境界・decode）──────────────────────────────────────────────
// zod で untrusted input を検証し、境界でドメイン型までパースする（"parse, don't validate"）。

// enum のメンバーはドメイン（entities）の値配列を単一の定義源として派生させる。
const taskStatusEnum = z.enum(taskStatusValues);
const taskPriorityEnum = z.enum(taskPriorityValues);

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  // 上限は業務ルールではなく境界の防御（無制限の入力をそのまま DB に入れない）。title と同じく
  // 門番（wire）の関心なのでここに置き、ドメインには持ち込まない。
  description: z.string().max(2000).nullable(),
  status: taskStatusEnum,
  priority: taskPriorityEnum,
  // 境界でワイヤの ISO 文字列をドメインの Date にパースする（"parse, don't validate"）。
  // 下流（ルート/ドメイン）は Date だけを扱い、string→Date 変換を各所で持たない。
  dueDate: z.iso
    .datetime({ offset: true })
    .nullable()
    .transform((s) => (s == null ? null : new Date(s))),
});

export const taskIdParamSchema = z.object({
  id: z.uuid(),
});

// ── レスポンス（出力境界・encode）──────────────────────────────────────────────
// ドメイン Task / drizzle 行を、全 endpoint 共通のワイヤ形へ serializer で整形する。

// タスクのワイヤ・レスポンス形（POST/PUT/GET/list 全 endpoint 共通の単一契約）。ドメインの `Task` とは別物:
// `c.json` が `Date` を ISO 文字列にエンコードするので date 系の leaf は string になり、`Task`（`Date`）と
// 一致しない。ゆえに再export せず境界の独立した契約として宣言する。
export type TaskResponse = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdBy: string;
  meta: {
    version: number;
    createdAt: string;
    updatedAt: string;
  };
};

/**
 * write 側（POST/PUT）: ドメイン `Task` をワイヤ形へエンコードする。`Date → ISO 文字列` の変換をここで
 * 明示し（Hono 任せにせず `TaskResponse` を実ワイヤ形と一致させ型を正直に保つため）、返り値型を固定する。
 */
export function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: encodeDate(task.dueDate),
    createdBy: task.createdBy,
    meta: {
      version: task.meta.version,
      createdAt: task.meta.createdAt.toISOString(),
      updatedAt: task.meta.updatedAt.toISOString(),
    },
  };
}

/**
 * read 側（GET/list）: drizzle 行（フラット）をワイヤ形へエンコードする。read はドメイン層を経由しない
 * （mini-CQRS）ので行から直接組むが、返り値型を `toTaskResponse` と共有して形が割れないことを型で保証する。
 */
export function rowToTaskResponse(row: TaskRow): TaskResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: encodeDate(row.dueDate),
    createdBy: row.createdBy,
    meta: {
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

function encodeDate(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}
