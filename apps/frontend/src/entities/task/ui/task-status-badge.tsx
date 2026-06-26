import { Badge } from '@/shared/ui/badge';

import { type TaskStatus, taskStatusLabels, taskStatusVariants } from '../model/task';

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant={taskStatusVariants[status]} data-testid="task-status-badge">
      {taskStatusLabels[status]}
    </Badge>
  );
}
