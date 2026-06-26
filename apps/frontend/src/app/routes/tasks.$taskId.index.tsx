import { createFileRoute } from '@tanstack/react-router';

import { TaskDetailPage } from '@/pages/task-detail';

export const Route = createFileRoute('/tasks/$taskId/')({
  component: TaskDetailPage,
});
