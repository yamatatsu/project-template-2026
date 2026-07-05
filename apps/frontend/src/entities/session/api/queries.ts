import { queryOptions } from '@tanstack/react-query';

import { client } from '@/shared/api';

import { UnauthorizedError } from '../lib/unauthorized-error';

/** 現在のセッションの query key。 */
export const sessionKeys = {
  current: ['session'] as const,
};

/**
 * 現在のユーザー（BFF の `GET /api/me`）の query options。
 *
 * non-OK レスポンスはすべて「セッションが使えない」ことを意味するので、
 * `UnauthorizedError` として表面化させ、auth guard がログインへリダイレクトできる
 * ようにする。認証失敗はリトライしても無意味なので `retry: false`。
 */
export function sessionQuery() {
  return queryOptions({
    queryKey: sessionKeys.current,
    queryFn: async () => {
      const res = await client.me.$get();
      if (!res.ok) {
        throw new UnauthorizedError();
      }
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
