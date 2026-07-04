import { queryOptions } from '@tanstack/react-query';

import { client } from '@/shared/api';

/** task エンティティの query key ファクトリ。 */
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

/** タスク一覧（createdAt 降順）の query options。 */
export function taskListQuery() {
  return queryOptions({
    queryKey: taskKeys.lists(),
    queryFn: async () => {
      const res = await client.tasks.$get();
      if (!res.ok) {
        throw new Error('タスク一覧の取得に失敗しました');
      }
      return res.json();
    },
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
