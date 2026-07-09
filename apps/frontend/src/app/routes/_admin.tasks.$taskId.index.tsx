import { createFileRoute } from '@tanstack/react-router';

import { TaskDetailPage } from '@/pages/task-detail';

export const Route = createFileRoute('/_admin/tasks/$taskId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { taskId } = Route.useParams();
  return <TaskDetailPage taskId={taskId} />;
}
