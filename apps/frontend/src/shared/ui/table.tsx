import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * `<table>` の見た目だけを整える低レベルなプリミティブ群（`TableHeader`/`TableBody`/`TableRow` …）。
 *
 * 推奨利用シーン: 行数が固定的で手書きする静的な表・レイアウト目的の表、または `DataTable` のような
 * 上位コンポーネントを組み立てるための土台。
 *
 * 非推奨: **データ配列を行に展開して見せる「データテーブル」には使わない**。ページネーション・
 * ソート・列定義の共通化が伴うため、代わりに {@link DataTable}（`@/shared/ui/data-table`）を使う。
 * ここを直接 map して一覧を組むと、それらの共通実装が各所で二重化する。
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
