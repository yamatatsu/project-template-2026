import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, rpcResponse } from '@/shared/test/fixtures';
import { renderAt } from '@/shared/test/render-route';

const tasksGet = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
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

describe('TasksPage routing', () => {
  it('navigates to the create form via 新規作成', async () => {
    tasksGet.mockResolvedValue(rpcResponse([makeTask()]));
    const user = userEvent.setup();

    renderAt('/tasks');

    await screen.findByTestId('tasks-table');

    await user.click(screen.getByRole('link', { name: '新規作成' }));

    await waitFor(() => expect(screen.getByTestId('task-form')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'タスクを作成' })).toBeInTheDocument();
  });
});
