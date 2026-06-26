import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import { TaskPriorityBadge, TaskStatusBadge, taskDetailQuery } from '@/entities/task';
import { DeleteTaskButton } from '@/features/delete-task';
import { formatDateTime } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';

export function TaskDetailPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId' });
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
        <Button variant="outline" render={<Link to="/tasks">一覧へ戻る</Link>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link to="/tasks">← 一覧へ</Link>} />
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
            {formatDateTime(task.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">更新日: </span>
            {formatDateTime(task.updatedAt)}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            render={
              <Link to="/tasks/$taskId/edit" params={{ taskId: task.id }}>
                編集
              </Link>
            }
          />
          <DeleteTaskButton task={task} onDeleted={() => void navigate({ to: '/tasks' })} />
        </CardFooter>
      </Card>
    </div>
  );
}
