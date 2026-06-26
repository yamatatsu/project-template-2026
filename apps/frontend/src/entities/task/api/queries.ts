import { queryOptions } from '@tanstack/react-query';

import { client } from '@/shared/api';

/** Query key factory for the task entity. */
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

/** Query options for the task list (createdAt descending). */
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

/** Query options for a single task by id. */
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
