import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import { client } from '@/shared/api';

/** ユーザー一覧のページング指定（1 始まりのページ番号と 1 ページの行数）。 */
export type UserListParams = {
  page: number;
  pageSize: number;
};

/** user エンティティの query key ファクトリ。 */
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UserListParams) => [...userKeys.lists(), params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

/** ユーザー一覧（createdAt 降順・サーバサイドページング）の query options。 */
export function userListQuery(params: UserListParams) {
  return queryOptions({
    queryKey: userKeys.list(params),
    queryFn: async () => {
      const res = await client.users.$get({
        query: { page: String(params.page), pageSize: String(params.pageSize) },
      });
      if (!res.ok) {
        throw new Error('ユーザー一覧の取得に失敗しました');
      }
      return res.json();
    },
    // ページ切替中は直前のページを表示し続け、テーブルがローディング表示に戻るちらつきを防ぐ。
    placeholderData: keepPreviousData,
  });
}

/** id 指定の単一ユーザーの query options。 */
export function userDetailQuery(id: string) {
  return queryOptions({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const res = await client.users[':id'].$get({ param: { id } });
      if (!res.ok) {
        throw new Error('ユーザーの取得に失敗しました');
      }
      return res.json();
    },
  });
}
