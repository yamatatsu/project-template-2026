import { createFileRoute } from '@tanstack/react-router';

import { TaskEditPage } from '@/pages/task-edit';

export const Route = createFileRoute('/_admin/tasks/$taskId/edit')({
  component: RouteComponent,
});

function RouteComponent() {
  const { taskId } = Route.useParams();
  return <TaskEditPage taskId={taskId} />;
}
