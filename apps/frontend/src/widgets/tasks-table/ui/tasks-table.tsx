import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { type Task, TaskPriorityBadge, TaskStatusBadge, taskListQuery } from '@/entities/task';
import { DeleteTaskButton } from '@/features/delete-task';
import { formatDateTime } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/button-link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const columnHelper = createColumnHelper<Task>();

const columns = [
  columnHelper.accessor('title', {
    header: 'タイトル',
    cell: (info) => (
      <Link
        to="/tasks/$taskId"
        params={{ taskId: info.row.original.id }}
        className="text-primary font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'ステータス',
    cell: (info) => <TaskStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('priority', {
    header: '優先度',
    cell: (info) => <TaskPriorityBadge priority={info.getValue()} />,
  }),
  columnHelper.accessor('dueDate', {
    header: '期限',
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.accessor((row) => row.meta.createdAt, {
    id: 'createdAt',
    header: '作成日',
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.display({
    id: 'actions',
    header: '操作',
    cell: (info) => (
      <div className="flex justify-end gap-2">
        <ButtonLink
          to="/tasks/$taskId/edit"
          params={{ taskId: info.row.original.id }}
          variant="outline"
          size="sm"
        >
          編集
        </ButtonLink>
        <DeleteTaskButton task={info.row.original} />
      </div>
    ),
  }),
];

export function TasksTable() {
  const { data, isPending, isError, error } = useQuery(taskListQuery());

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-table-empty">
        タスクがありません。
      </p>
    );
  }

  return (
    <Table data-testid="tasks-table">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
