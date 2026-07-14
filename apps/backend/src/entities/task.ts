// ドメインの語彙（取りうる値の集合）の単一定義源。
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;
export const taskPriorityValues = ['low', 'medium', 'high'] as const;
export type TaskStatus = (typeof taskStatusValues)[number];
export type TaskPriority = (typeof taskPriorityValues)[number];

// 記録メタデータ（版・監査タイムスタンプ）はドメインに持たせない。業務ルールと直交する永続化の
// 関心なので、repo が `Persisted<T>` として値と対で運ぶ（docs/specs/optimistic-lock.md）。
export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  // 作成者は業務の事実（所有）。記録メタデータではないのでドメインが持つ。
  createdBy: string;
};

export type TaskCreateCommand = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  // 作成者は命令の一部として受け取る（生成側で自己決定しない）。
  createdBy: string;
};

export type TaskUpdates = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
};

/**
 * 命令から新規 Task を組み立てる純粋関数（副作用なし・DB を触らない）。
 * id は意図ではなく実行時コンテキストとして外から注入する。
 */
export function createTask(command: TaskCreateCommand, { id }: { id: string }): Task {
  return { id, ...command };
}

/**
 * ロードした Task に更新を適用し、次の状態を返す純粋関数（副作用なし・DB を触らない）。
 * 状態遷移のルールはここに集約する（ルートに散らさない）。
 */
export function applyUpdate(current: Task, updates: TaskUpdates): Task {
  return { ...current, ...updates };
}
