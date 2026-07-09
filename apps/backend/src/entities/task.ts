import { type Result, err, ok } from '@icasu/simple-result';

// ドメインの語彙（取りうる値の集合）はここが単一の定義源。境界の zod（wire）も DB（将来的に
// packages/domains 切り出し後）もこの配列から派生させ、infra→domain の依存方向にそろえる。
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;
export const taskPriorityValues = ['low', 'medium', 'high'] as const;
export type TaskStatus = (typeof taskStatusValues)[number];
export type TaskPriority = (typeof taskPriorityValues)[number];

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  createdBy: string;
  meta: {
    version: number;
    createdAt: Date;
    updatedAt: Date;
  };
};

export type TaskCreateCommand = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  // 作成者はクライアント入力ではなく authZ が解決した User。命令の一部としてルートから渡す。
  createdBy: string;
};

export type TaskUpdateCommand = {
  updates: {
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: Date | null;
  };
  // クライアントが編集の土台にした版（楽観ロックの前提）。ロードした版と一致しなければ競合。
  expectedVersion: number;
};

export type VersionConflict = {
  type: 'version-conflict';
  expected: number; // クライアントが土台にした版
  actual: number; // ロード時点で DB にあった版
};

// 新規 Task の版の起点。増分（applyUpdate の +1）と対をなす「版はどこから始まるか」もドメインの決定。
const INITIAL_VERSION = 1;

/**
 * 命令から新規 Task を組み立てる純粋関数（副作用なし・DB を触らない）。版は INITIAL_VERSION に固定し、
 * id・now は意図ではなく実行時コンテキストとして外から注入する（applyUpdate の now 注入と同じ切り分け）。
 */
export function createTask(
  command: TaskCreateCommand,
  { id, now }: { id: string; now: Date },
): Task {
  return {
    id,
    ...command,
    meta: { version: INITIAL_VERSION, createdAt: now, updatedAt: now },
  };
}

/**
 * ロードした Task にコマンドを適用し、次の状態を返す純粋関数（副作用なし・DB を触らない）。
 * now（時計）は意図ではなく実行時コンテキストなので外から注入する。
 */
export function applyUpdate(
  current: Task,
  command: TaskUpdateCommand,
  { now }: { now: Date },
): Result<Task, VersionConflict> {
  const checked = ensureExpectedVersion(current, command.expectedVersion);
  if (!checked.ok) {
    return checked;
  }
  return ok({
    ...current,
    ...command.updates,
    meta: { ...current.meta, version: current.meta.version + 1, updatedAt: now },
  });
}

/**
 * 楽観ロックの前提（クライアントが土台にした版＝ロードした版）を検証する純粋関数。「版競合とは何か」の
 * 判断を 1 か所に閉じ、applyUpdate が内部で使う。成功時は検証済みの current をそのまま返し、
 * 呼び出し側が続けて遷移に進めるようにする（DELETE に楽観ロックを足すなら同じくここを共用できる）。
 */
export function ensureExpectedVersion(
  current: Task,
  expectedVersion: number,
): Result<Task, VersionConflict> {
  if (current.meta.version !== expectedVersion) {
    return err({
      type: 'version-conflict',
      expected: expectedVersion,
      actual: current.meta.version,
    });
  }
  return ok(current);
}
