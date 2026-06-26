import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { taskDetailQuery } from '@/entities/task';
import { TaskForm } from '@/features/task-form';
import { Button } from '@/shared/ui/button';

export function TaskEditPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId/edit' });
  const { data: task, isPending, isError } = useQuery(taskDetailQuery(taskId));

  if (isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm" data-testid="task-edit-loading">
        読み込み中...
      </p>
    );
  }

  if (isError || !task) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-destructive text-sm" data-testid="task-edit-error">
          タスクが見つかりませんでした。
        </p>
        <Button variant="outline" render={<Link to="/tasks">一覧へ戻る</Link>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
              ← 詳細へ
            </Link>
          }
        />
        <h1 className="text-2xl font-bold">タスクを編集</h1>
      </div>
      <TaskForm mode="edit" task={task} />
    </div>
  );
}
