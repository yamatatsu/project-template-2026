import { createFileRoute } from '@tanstack/react-router';

import { TaskEditPage } from '@/pages/task-edit';

export const Route = createFileRoute('/tasks/$taskId/edit')({
  component: TaskEditPage,
});
