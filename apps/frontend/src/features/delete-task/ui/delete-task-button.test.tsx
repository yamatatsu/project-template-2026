import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, rpcResponse } from '@/shared/test/fixtures';

import { DeleteTaskButton } from './delete-task-button';

const detailDelete = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
    tasks: Object.assign(
      { $get: vi.fn(), $post: vi.fn() },
      {
        ':id': {
          $get: vi.fn(),
          $put: vi.fn(),
          $delete: (...args: unknown[]) => detailDelete(...args),
        },
      },
    ),
  },
}));

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeleteTaskButton', () => {
  it('opens the dialog, DELETEs by id on confirm, and fires onDeleted', async () => {
    detailDelete.mockResolvedValue(rpcResponse({ id: 'del-1' }));
    const onDeleted = vi.fn();
    const user = userEvent.setup();

    renderWithQuery(<DeleteTaskButton task={makeTask({ id: 'del-1' })} onDeleted={onDeleted} />);

    // Dialog content is not mounted until the trigger is clicked.
    expect(screen.queryByTestId('delete-task-dialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('delete-task-trigger'));

    expect(await screen.findByTestId('delete-task-dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('delete-task-confirm'));

    await waitFor(() => expect(detailDelete).toHaveBeenCalledTimes(1));
    expect(detailDelete.mock.calls[0]?.[0]).toEqual({ param: { id: 'del-1' } });

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
