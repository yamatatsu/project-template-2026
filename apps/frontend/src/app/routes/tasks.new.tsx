import { createFileRoute } from '@tanstack/react-router';

import { TaskNewPage } from '@/pages/task-new';

export const Route = createFileRoute('/tasks/new')({
  component: TaskNewPage,
});
