import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, rpcResponse } from '@/__tests__/fixtures';
import { renderAt } from '@/__tests__/render-route';

const tasksGet = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
    me: {
      $get: () => Promise.resolve(rpcResponse({ userSub: 'test-user', email: 'test@example.com' })),
    },
    tasks: Object.assign(
      { $get: (...args: unknown[]) => tasksGet(...args), $post: vi.fn() },
      { ':id': { $get: vi.fn(), $put: vi.fn(), $delete: vi.fn() } },
    ),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TasksTable', () => {
  it('renders a row per task with title link and badges', async () => {
    tasksGet.mockResolvedValue(
      rpcResponse([
        makeTask({ id: 'a', title: 'タスクA', status: 'todo', priority: 'high' }),
        makeTask({ id: 'b', title: 'タスクB', status: 'done', priority: 'low' }),
      ]),
    );

    renderAt('/tasks');

    await screen.findByTestId('tasks-table');

    const linkA = screen.getByRole('link', { name: 'タスクA' });
    expect(linkA).toHaveAttribute('href', '/tasks/a');
    expect(screen.getByRole('link', { name: 'タスクB' })).toHaveAttribute('href', '/tasks/b');

    expect(screen.getAllByTestId('task-status-badge')).toHaveLength(2);
    expect(screen.getAllByTestId('task-priority-badge')).toHaveLength(2);
    expect(screen.getByText('未着手')).toBeInTheDocument();
    expect(screen.getByText('完了')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
    expect(screen.getByText('低')).toBeInTheDocument();
  });

  it('shows the empty state for an empty list', async () => {
    tasksGet.mockResolvedValue(rpcResponse([]));

    renderAt('/tasks');

    expect(await screen.findByTestId('tasks-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-table')).not.toBeInTheDocument();
  });

  it('shows the error state when the request fails', async () => {
    tasksGet.mockResolvedValue(rpcResponse(null, { ok: false, status: 500 }));

    renderAt('/tasks');

    // 共有の QueryClient は失敗した query をリトライする（デフォルト 3 回）ため、長めに待つ。
    expect(
      await screen.findByTestId('tasks-table-error', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
  }, 20000);
});
