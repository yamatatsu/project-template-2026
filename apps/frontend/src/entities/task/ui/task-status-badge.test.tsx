import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type TaskStatus } from '../model/task';
import { TaskStatusBadge } from './task-status-badge';

describe('TaskStatusBadge', () => {
  it.each<[TaskStatus, string]>([
    ['todo', '未着手'],
    ['in_progress', '進行中'],
    ['done', '完了'],
  ])('renders the %s status as "%s"', (status, label) => {
    render(<TaskStatusBadge status={status} />);

    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent(label);
  });
});
