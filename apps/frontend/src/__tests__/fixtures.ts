import { type Task } from '@/entities/task';

/** 妥当な既定値入りの Task フィクスチャを作る。必要なフィールドだけ上書きする。 */
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'サンプルタスク',
    description: '説明テキスト',
    status: 'todo',
    priority: 'medium',
    dueDate: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  } as Task;
}

/** Hono RPC の Response 相当の偽オブジェクト（`client.*` の戻り値の形）を作る。 */
export function rpcResponse<T>(body: T, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}
