import type { Task as TaskRow } from '@icasu/db/schema';
import { z } from 'zod';

import type { Task, TaskPriority, TaskStatus } from '../entities/task.ts';
import { taskPriorityValues, taskStatusValues } from '../entities/task.ts';

// task がワイヤを越える形（入力＝request / 出力＝response）を 1 feature 1 ファイルにまとめる。方向で
// モジュールを割らず**リソースで割る**のは、feature を足す人が「送る形・返る形」を一度に触るため、
// また共有フィールド（列名・enum・dueDate の encode/decode 非対称）の drift を隣り合わせでレビューで
// 気づけるようにするため。整合の**強制**は物理的近接ではなく共通の上流ソース（`entities`）が担う——enum は
// ここで二重宣言せず `entities` の値配列/型から派生させる。フロントへの契約は `AppType`（Infer*Type）が担う
// ので、このファイルは package export しない（サーバ内部実装）。request は「信頼できない入力の門番」=zod
// ランタイム検証、response は信頼済み出力の serializer で**役割が違う**ため、下記のセクションで方向を分ける。

// ── リクエスト（入力境界・decode）──────────────────────────────────────────────
// zod で untrusted input を検証し、境界でドメイン型までパースする（"parse, don't validate"）。

// enum のメンバーはドメイン（entities）の値配列を単一の定義源として派生させる。
const taskStatusEnum = z.enum(taskStatusValues);
const taskPriorityEnum = z.enum(taskPriorityValues);

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().nullable(),
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

// タスクのワイヤ・レスポンス形（POST/PUT/GET/list 全 endpoint 共通の単一契約）。ドメインの `Task` とは
// **別物**として持つ: `c.json` が `Date` を ISO 文字列にエンコードするので date 系の leaf が string になり、
// `Task`（`Date`）と一致しない。ゆえにドメイン型の再export は誤り——境界の独立した契約として宣言する
// （入力側で `taskInputSchema` を `TaskUpdateCommand` と別に持つのと同じ。境界の語彙 ≠ ドメインの語彙）。
// 監査列は `meta` にまとめ業務フィールドと分離する。
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
 * 明示的に行い（入力境界の zod `.transform` による ISO→Date デコードと対称。Hono 任せにせず明示するのは
 * `TaskResponse` を実際のワイヤ形と一致させ型を正直に保つため）、返り値型を `TaskResponse` に固定する。
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
 * read 側（GET/list）: drizzle 行（フラット）をワイヤ形へエンコードする。read はドメイン層（entities/repo）を
 * 経由しない方針（mini-CQRS）なので行から直接 `meta` ネストへ組み替えるが、返り値型を `toTaskResponse` と
 * **共有**することで、read と write のレスポンス形が割れないことを型で保証する。
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
