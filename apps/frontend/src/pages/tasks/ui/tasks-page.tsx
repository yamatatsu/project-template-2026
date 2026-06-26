import { Link } from '@tanstack/react-router';

import { Button } from '@/shared/ui/button';
import { TasksTable } from '@/widgets/tasks-table';

export function TasksPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">タスク</h1>
        <Button render={<Link to="/tasks/new">新規作成</Link>} />
      </div>
      <TasksTable />
    </div>
  );
}
