import { Link } from '@tanstack/react-router';

import { TaskForm } from '@/features/task-form';
import { Button } from '@/shared/ui/button';

export function TaskNewPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link to="/tasks">← 一覧へ</Link>} />
        <h1 className="text-2xl font-bold">タスクを作成</h1>
      </div>
      <TaskForm mode="create" />
    </div>
  );
}
