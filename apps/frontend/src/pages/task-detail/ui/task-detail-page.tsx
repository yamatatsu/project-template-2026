import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { TaskPriorityBadge, TaskStatusBadge, taskDetailQuery } from '@/entities/task';
import { DeleteTaskButton } from '@/features/delete-task';
import { formatDateTime } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/button-link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const { data: task, isPending, isError } = useQuery(taskDetailQuery(taskId));

  if (isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm" data-testid="task-detail-loading">
        読み込み中...
      </p>
    );
  }

  if (isError || !task) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-destructive text-sm" data-testid="task-detail-error">
          タスクが見つかりませんでした。
        </p>
        <ButtonLink to="/tasks" variant="outline">
          一覧へ戻る
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <ButtonLink to="/tasks" variant="ghost" size="sm">
          ← 一覧へ
        </ButtonLink>
        <h1 className="text-2xl font-bold">タスク詳細</h1>
      </div>

      <Card data-testid="task-detail">
        <CardHeader>
          <CardTitle>{task.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">ステータス:</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">優先度:</span>
            <TaskPriorityBadge priority={task.priority} />
          </div>
          <div>
            <span className="text-muted-foreground">期限: </span>
            {formatDateTime(task.dueDate)}
          </div>
          <div>
            <span className="text-muted-foreground">説明: </span>
            <span className="whitespace-pre-wrap">{task.description ?? '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">作成日: </span>
            {formatDateTime(task.meta.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">更新日: </span>
            {formatDateTime(task.meta.updatedAt)}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <ButtonLink to="/tasks/$taskId/edit" params={{ taskId: task.id }}>
            編集
          </ButtonLink>
          <DeleteTaskButton task={task} onDeleted={() => void navigate({ to: '/tasks' })} />
        </CardFooter>
      </Card>
    </div>
  );
}
