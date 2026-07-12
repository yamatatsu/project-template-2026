import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { useState } from 'react';

import { type Task, TaskPriorityBadge, TaskStatusBadge, taskListQuery } from '@/entities/task';
import { DeleteTaskButton } from '@/features/delete-task';
import { formatDateTime } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/button-link';
import { DataTable } from '@/shared/ui/data-table';

const DEFAULT_PAGE_SIZE = 20;

const columns: ColumnDef<Task>[] = [
  {
    accessorKey: 'title',
    header: 'タイトル',
    cell: ({ row }) => (
      <Link
        to="/tasks/$taskId"
        params={{ taskId: row.original.id }}
        className="text-primary font-medium hover:underline"
      >
        {row.original.title}
      </Link>
    ),
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
  {
    id: 'createdAt',
    header: '作成日',
    cell: ({ row }) => formatDateTime(row.original.meta.createdAt),
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => (
      <div className="flex justify-end gap-2">
        <ButtonLink
          to="/tasks/$taskId/edit"
          params={{ taskId: row.original.id }}
          variant="outline"
          size="sm"
        >
          編集
        </ButtonLink>
        <DeleteTaskButton task={row.original} />
      </div>
    ),
  },
];

export function TasksTable() {
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
      <p className="text-muted-foreground text-sm" data-testid="tasks-table-loading">
        読み込み中...
      </p>
    );
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm" data-testid="tasks-table-error">
        {error instanceof Error ? error.message : 'エラーが発生しました'}
      </p>
    );
  }

  if (data.total === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-table-empty">
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
      data-testid="tasks-table"
    />
  );
}
