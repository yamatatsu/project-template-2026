import { createFileRoute } from '@tanstack/react-router';

import { TaskDetailPage } from '@/pages/task-detail';

export const Route = createFileRoute('/_admin/tasks/$taskId/')({
  component: TaskDetailPage,
});
