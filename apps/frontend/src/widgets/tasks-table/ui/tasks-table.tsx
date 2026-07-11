import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  type Table as ReactTable,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import { type Task, TaskPriorityBadge, TaskStatusBadge, taskListQuery } from '@/entities/task';
import { DeleteTaskButton } from '@/features/delete-task';
import { formatDateTime } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ButtonLink } from '@/shared/ui/button-link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

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
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const { data, isPending, isError, error } = useQuery(
    // pagination（0 始まり）をワイヤの page（1 始まり）に読み替える。
    taskListQuery({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize }),
  );

  const pageCount =
    data === undefined ? undefined : Math.max(1, Math.ceil(data.total / pagination.pageSize));
  useEffect(() => {
    // 最終ページの行が削除などで消えると現在ページが範囲外になり得るので、最終ページへ戻す。
    if (pageCount !== undefined && pagination.pageIndex >= pageCount) {
      setPagination((prev) => ({ ...prev, pageIndex: pageCount - 1 }));
    }
  }, [pageCount, pagination.pageIndex]);

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    // ページ分割はサーバ側（バックエンドが 1 レスポンスの行数に上限を持つ）。テーブルには現在ページの
    // 行だけを渡し、ページ数・前後可否は rowCount（全件数）から導出させる。
    manualPagination: true,
    rowCount: data?.total ?? 0,
    state: { pagination },
    onPaginationChange: setPagination,
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

  if (data.total === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="tasks-table-empty">
        タスクがありません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
      <TasksTablePagination table={table} total={data.total} />
    </div>
  );
}

function TasksTablePagination({ table, total }: { table: ReactTable<Task>; total: number }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2"
      data-testid="tasks-table-pagination"
    >
      <p className="text-muted-foreground text-sm">全 {total} 件</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">表示件数</span>
          <Select
            value={String(pageSize)}
            // 表示件数を変えると既存のページ割りは意味を失うので 1 ページ目に戻す。
            onValueChange={(value) =>
              table.setPagination({ pageIndex: 0, pageSize: Number(value) })
            }
          >
            <SelectTrigger size="sm" data-testid="tasks-table-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm">
          {pageIndex + 1} / {table.getPageCount()} ページ
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </Button>
        </div>
      </div>
    </div>
  );
}
