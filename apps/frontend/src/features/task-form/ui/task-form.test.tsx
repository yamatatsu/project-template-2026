import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTask, rpcResponse } from '@/__tests__/fixtures';
import { renderAt } from '@/__tests__/render-route';

const tasksPost = vi.fn();
const detailGet = vi.fn();
const detailPut = vi.fn();

vi.mock('@/shared/api', () => ({
  client: {
    tasks: Object.assign(
      { $get: vi.fn(), $post: (...args: unknown[]) => tasksPost(...args) },
      {
        ':id': {
          $get: (...args: unknown[]) => detailGet(...args),
          $put: (...args: unknown[]) => detailPut(...args),
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

describe('TaskForm (create)', () => {
  it('shows a title error and does not POST when title is empty', async () => {
    const user = userEvent.setup();
    renderAt('/tasks/new');

    await screen.findByTestId('task-form');

    await user.click(screen.getByTestId('task-form-submit'));

    expect(await screen.findByTestId('task-form-title-error')).toBeInTheDocument();
    expect(tasksPost).not.toHaveBeenCalled();
  });

  it('POSTs the form values (with offset ISO dueDate) on valid submit', async () => {
    tasksPost.mockResolvedValue(rpcResponse(makeTask({ id: 'created-1' })));

    const user = userEvent.setup();
    renderAt('/tasks/new');

    await screen.findByTestId('task-form');

    await user.type(screen.getByLabelText('タイトル'), '新しいタスク');
    await user.type(screen.getByLabelText('説明'), 'やること');
    // datetime-local value (interpreted as local time, serialized to ISO).
    const dueInput = screen.getByLabelText('期限');
    await user.type(dueInput, '2026-07-15T09:30');

    await user.click(screen.getByTestId('task-form-submit'));

    await waitFor(() => expect(tasksPost).toHaveBeenCalledTimes(1));

    const arg = tasksPost.mock.calls[0]?.[0] as { json: Record<string, unknown> };
    expect(arg.json.title).toBe('新しいタスク');
    expect(arg.json.description).toBe('やること');
    expect(arg.json.status).toBe('todo');
    expect(arg.json.priority).toBe('medium');
    // dueDate is converted to an offset ISO string ending in Z.
    expect(arg.json.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(arg.json.dueDate as string).getTime()).toBe(
      new Date('2026-07-15T09:30').getTime(),
    );
  });
});

describe('TaskForm (edit)', () => {
  it('prefills fields from the task and PUTs id + json on submit', async () => {
    const task = makeTask({
      id: 'edit-1',
      title: '既存タスク',
      description: '既存の説明',
      status: 'in_progress',
      priority: 'high',
      dueDate: null,
    });
    detailGet.mockResolvedValue(rpcResponse(task));
    detailPut.mockResolvedValue(rpcResponse(task));

    const user = userEvent.setup();
    renderAt('/tasks/edit-1/edit');

    // The edit page loads the task, then the form mounts prefilled.
    await screen.findByTestId('task-form');

    const titleInput = screen.getByLabelText<HTMLInputElement>('タイトル');
    expect(titleInput.value).toBe('既存タスク');
    expect(screen.getByLabelText<HTMLTextAreaElement>('説明').value).toBe('既存の説明');
    // base-ui Select renders the raw value in jsdom (items aren't measured in a
    // portal), so assert the selected value rather than the localized label.
    expect(screen.getByTestId('task-form-status')).toHaveTextContent('in_progress');
    expect(screen.getByTestId('task-form-priority')).toHaveTextContent('high');

    await user.clear(titleInput);
    await user.type(titleInput, '更新後タイトル');
    await user.click(screen.getByTestId('task-form-submit'));

    await waitFor(() => expect(detailPut).toHaveBeenCalledTimes(1));
    const arg = detailPut.mock.calls[0]?.[0] as {
      param: { id: string };
      json: Record<string, unknown>;
    };
    expect(arg.param).toEqual({ id: 'edit-1' });
    expect(arg.json.title).toBe('更新後タイトル');
    expect(arg.json.status).toBe('in_progress');
    expect(arg.json.priority).toBe('high');
    expect(arg.json.dueDate).toBeNull();
  });
});
