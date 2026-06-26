import { Badge } from '@/shared/ui/badge';

import { type TaskPriority, taskPriorityLabels, taskPriorityVariants } from '../model/task';

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={taskPriorityVariants[priority]} data-testid="task-priority-badge">
      {taskPriorityLabels[priority]}
    </Badge>
  );
}
