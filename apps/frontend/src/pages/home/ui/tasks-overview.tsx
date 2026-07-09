import { useQuery } from '@tanstack/react-query';

import { TaskPriorityBadge, TaskStatusBadge, taskListQuery } from '@/entities/task';
import { formatDateTime } from '@/shared/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

// トップ用の読み取り専用タスク一覧。編集・削除や詳細への導線は持たない（それらは管理画面の責務）。
// widgets/tasks-table と役割が別（あちらは管理操作込み）なので共有せず、トップの関心に閉じて置く。
export function TasksOverview() {
  const { data, isPending, isError, error } = useQuery(taskListQuery());

  if (isPending) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-overview-loading">
        読み込み中...
      </p>
    );
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm" data-testid="tasks-overview-error">
        {error instanceof Error ? error.message : 'エラーが発生しました'}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-overview-empty">
        タスクがありません。
      </p>
    );
  }

  return (
    <Table data-testid="tasks-overview">
      <TableHeader>
        <TableRow>
          <TableHead>タイトル</TableHead>
          <TableHead>ステータス</TableHead>
          <TableHead>優先度</TableHead>
          <TableHead>期限</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell>
              <TaskStatusBadge status={task.status} />
            </TableCell>
            <TableCell>
              <TaskPriorityBadge priority={task.priority} />
            </TableCell>
            <TableCell>{formatDateTime(task.dueDate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
