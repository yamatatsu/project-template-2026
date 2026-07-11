import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { makeTaskList, rpcResponse } from '@/__tests__/fixtures';

import { routeTree } from './router';

// 管理画面領域は admin（task:write を持つ）でしか入れないので、ルーティングのテストは admin セッションを
// 前提にする。タスク一覧の中身は本テストの関心外なので空配列で十分。
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
      { $get: () => Promise.resolve(rpcResponse(makeTaskList([]))), $post: vi.fn() },
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

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
}

it('renders the task list without side nav on the top page', async () => {
  renderAt('/');

  await screen.findByRole('heading', { name: 'タスク一覧' });
  // トップにはサイドナビが無い（ユーザーへのナビゲーションは管理画面だけ）。
  expect(screen.queryByRole('link', { name: 'ユーザー' })).not.toBeInTheDocument();
});

it('highlights the タスク nav item on /tasks (admin area)', async () => {
  renderAt('/tasks');

  const tasksLink = await screen.findByRole('link', { name: 'タスク' });
  const usersLink = screen.getByRole('link', { name: 'ユーザー' });

  await waitFor(() => expect(tasksLink).toHaveAttribute('data-active'));
  expect(usersLink).not.toHaveAttribute('data-active');
});

it('highlights the ユーザー nav item on /users (admin area)', async () => {
  renderAt('/users');

  const usersLink = await screen.findByRole('link', { name: 'ユーザー' });
  const tasksLink = screen.getByRole('link', { name: 'タスク' });

  await waitFor(() => expect(usersLink).toHaveAttribute('data-active'));
  expect(tasksLink).not.toHaveAttribute('data-active');
});
