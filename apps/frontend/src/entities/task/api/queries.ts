import { queryOptions } from '@tanstack/react-query';

import { client } from '@/shared/api';

/** タスク一覧のページング指定（1 始まりのページ番号と 1 ページの行数）。 */
export type TaskListParams = {
  page: number;
  pageSize: number;
};

/** task エンティティの query key ファクトリ。 */
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (params: TaskListParams) => [...taskKeys.lists(), params] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

/** タスク一覧（createdAt 降順・サーバサイドページング）の query options。 */
export function taskListQuery(params: TaskListParams) {
  return queryOptions({
    queryKey: taskKeys.list(params),
    queryFn: async () => {
      const res = await client.tasks.$get({
        query: { page: String(params.page), pageSize: String(params.pageSize) },
      });
      if (!res.ok) {
        throw new Error('タスク一覧の取得に失敗しました');
      }
      return res.json();
    },
    // placeholderData は使わない。直前ページを表示し続けると、次ページ取得が終わるまで
    // 画面が変わらず「ボタンを押しても反応がない」ラグに見えるため。未キャッシュのページは
    // data=undefined → isPending=true となり、リスト全体がローディング表示に切り替わる。
  });
}

/** id 指定の単一タスクの query options。 */
export function taskDetailQuery(id: string) {
  return queryOptions({
    queryKey: taskKeys.detail(id),
    queryFn: async () => {
      const res = await client.tasks[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('タスクの取得に失敗しました');
      }
      return res.json();
    },
  });
}
