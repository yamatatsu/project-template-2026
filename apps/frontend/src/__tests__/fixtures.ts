import { type Task } from '@/entities/task';

/** Build a Task fixture with sensible defaults; override fields as needed. */
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

/** Build a fake Hono RPC Response-like object (as returned by `client.*`). */
export function rpcResponse<T>(body: T, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => body,
  };
}
