import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { useState } from 'react';

import { type Task, TaskPriorityBadge, TaskStatusBadge, taskListQuery } from '@/entities/task';
import { formatDateTime } from '@/shared/lib/utils';
import { DataTable } from '@/shared/ui/data-table';

const DEFAULT_PAGE_SIZE = 20;

// トップ用の読み取り専用の列。編集・削除や詳細への導線は持たない（それらは管理画面の責務）。
// widgets/tasks-table と役割が別（あちらは管理操作込み）なので列は共有せず、トップの関心に閉じて置く。
const columns: ColumnDef<Task>[] = [
  {
    accessorKey: 'title',
    header: 'タイトル',
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    accessorKey: 'status',
    header: 'ステータス',
    cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'priority',
    header: '優先度',
    cell: ({ row }) => <TaskPriorityBadge priority={row.original.priority} />,
  },
  {
    accessorKey: 'dueDate',
    header: '期限',
    cell: ({ row }) => formatDateTime(row.original.dueDate),
  },
];

export function TasksOverview() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const { data, isPending, isError, error } = useQuery(
    // pagination（0 始まり）をワイヤの page（1 始まり）に読み替える。
    taskListQuery({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize }),
  );

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

  if (data.total === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-overview-empty">
        タスクがありません。
      </p>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data.items}
      rowCount={data.total}
      pagination={pagination}
      onPaginationChange={setPagination}
      data-testid="tasks-overview"
    />
  );
}
