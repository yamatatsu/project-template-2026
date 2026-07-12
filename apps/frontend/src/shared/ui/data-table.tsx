import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type Table as ReactTable,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect } from 'react';

import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  // 現在ページの行だけを渡す。全件は rowCount で伝える（ページ割りはサーバ側）。
  data: TData[];
  rowCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  pageSizeOptions?: number[];
  'data-testid'?: string;
};

/**
 * データ配列を行に展開して見せる「データテーブル」の共通コンポーネント（サーバサイドページネーション前提）。
 *
 * 推奨利用シーン: **一覧・検索結果など、取得したデータを表形式で表示するすべての画面**。列は
 * `ColumnDef<TData>[]` で宣言し、`data`（現在ページの行）と `rowCount`（全件数）を渡す。ページャ UI・
 * ページ数算出・ページ範囲外補正はこのコンポーネントが受け持つので、各画面で作り込まない。
 *
 * 使わない場合: 行が固定的な静的表・レイアウト目的の表は、素の {@link Table}（`@/shared/ui/table`）で書く。
 *
 * 設計メモ: ページング状態は呼び出し側が所有する（query key が pagination に依存するため prop で受け取る）。
 * ローディング/エラー/空表示は testid・文言がスライスごとに異なるため、ここには持たず呼び出し側に委ねる。
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  rowCount,
  pagination,
  onPaginationChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  'data-testid': dataTestid,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // ページ分割はサーバ側（バックエンドが 1 レスポンスの行数に上限を持つ）。テーブルには現在
    // ページの行だけを渡し、ページ数・前後可否は rowCount（全件数）から導出させる。
    manualPagination: true,
    rowCount,
    state: { pagination },
    onPaginationChange,
  });

  const pageCount = table.getPageCount();
  useEffect(() => {
    // 最終ページの行が削除などで消えると現在ページが範囲外になり得るので、最終ページへ戻す。
    if (pagination.pageIndex >= pageCount) {
      table.setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pagination.pageIndex, table]);

  return (
    <div className="flex flex-col gap-4">
      <Table data-testid={dataTestid}>
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
      <DataTablePagination table={table} total={rowCount} pageSizeOptions={pageSizeOptions} />
    </div>
  );
}

function DataTablePagination<TData>({
  table,
  total,
  pageSizeOptions,
}: {
  table: ReactTable<TData>;
  total: number;
  pageSizeOptions: number[];
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2"
      data-testid="data-table-pagination"
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
            <SelectTrigger size="sm" data-testid="data-table-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
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
