import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, rpcResponse } from '@/shared/test/fixtures';
import { renderAt } from '@/shared/test/render-route';

const detailGet = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
    tasks: Object.assign(
      { $get: vi.fn(), $post: vi.fn() },
      {
        ':id': {
          $get: (...args: unknown[]) => detailGet(...args),
          $put: vi.fn(),
          $delete: vi.fn(),
        },
      },
    ),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TaskDetailPage', () => {
  it('requests the task by id and renders its attributes', async () => {
    detailGet.mockResolvedValue(
      rpcResponse(
        makeTask({
          id: 'detail-1',
          title: '詳細タスク',
          description: '詳細の説明',
          status: 'done',
          priority: 'high',
        }),
      ),
    );

    renderAt('/tasks/detail-1');

    const card = await screen.findByTestId('task-detail');
    expect(detailGet).toHaveBeenCalledWith({ param: { id: 'detail-1' } });

    expect(card).toHaveTextContent('詳細タスク');
    expect(card).toHaveTextContent('詳細の説明');
    expect(screen.getByTestId('task-status-badge')).toHaveTextContent('完了');
    expect(screen.getByTestId('task-priority-badge')).toHaveTextContent('高');
  });

  it('shows the error state when the task is not found', async () => {
    detailGet.mockResolvedValue(rpcResponse(null, { ok: false, status: 404 }));

    renderAt('/tasks/missing');

    // The shared QueryClient retries failed queries (default 3x), so allow extra time.
    expect(
      await screen.findByTestId('task-detail-error', {}, { timeout: 15000 }),
    ).toBeInTheDocument();
  }, 20000);
});
