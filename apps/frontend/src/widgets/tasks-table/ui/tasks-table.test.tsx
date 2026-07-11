import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, makeTaskList, rpcResponse } from '@/__tests__/fixtures';
import { renderAt } from '@/__tests__/render-route';

const tasksGet = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
    me: {
      $get: () =>
        Promise.resolve(
          rpcResponse({
            userSub: 'test-user',
            email: 'test@example.com',
            permissions: ['task:read', 'task:write'],
          }),
        ),
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
      rpcResponse(
        makeTaskList([
          makeTask({ id: 'a', title: 'タスクA', status: 'todo', priority: 'high' }),
          makeTask({ id: 'b', title: 'タスクB', status: 'done', priority: 'low' }),
        ]),
      ),
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
    tasksGet.mockResolvedValue(rpcResponse(makeTaskList([])));

    renderAt('/tasks');

    expect(await screen.findByTestId('tasks-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-table')).not.toBeInTheDocument();
  });

  it('requests the next page when 次へ is clicked', async () => {
    // 全 25 件・pageSize 20 → 2 ページ構成。1 ページ目は 20 件返す。
    tasksGet.mockResolvedValue(
      rpcResponse(
        makeTaskList(
          Array.from({ length: 20 }, (_, i) => makeTask({ id: `task-${i}`, title: `タスク${i}` })),
          25,
        ),
      ),
    );
    const user = userEvent.setup();

    renderAt('/tasks');

    await screen.findByTestId('tasks-table');
    expect(tasksGet).toHaveBeenLastCalledWith({ query: { page: '1', pageSize: '20' } });
    expect(screen.getByText('1 / 2 ページ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(tasksGet).toHaveBeenLastCalledWith({ query: { page: '2', pageSize: '20' } });
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
