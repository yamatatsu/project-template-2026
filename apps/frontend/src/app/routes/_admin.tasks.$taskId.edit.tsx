import { createFileRoute } from '@tanstack/react-router';

import { TaskEditPage } from '@/pages/task-edit';

export const Route = createFileRoute('/_admin/tasks/$taskId/edit')({
  component: TaskEditPage,
});
