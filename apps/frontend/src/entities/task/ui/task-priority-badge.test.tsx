import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type TaskPriority } from '../model/task';
import { TaskPriorityBadge } from './task-priority-badge';

describe('TaskPriorityBadge', () => {
  it.each<[TaskPriority, string]>([
    ['low', '低'],
    ['medium', '中'],
    ['high', '高'],
  ])('renders the %s priority as "%s"', (priority, label) => {
    render(<TaskPriorityBadge priority={priority} />);

    const badge = screen.getByTestId('task-priority-badge');
    expect(badge).toHaveTextContent(label);
  });
});
