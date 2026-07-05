import type { InferResponseType } from 'hono/client';

import type { client } from '@/shared/api';

/** BFF の `GET /api/me` エンドポイントが返す、現在のユーザー。 */
export type SessionUser = InferResponseType<typeof client.me.$get, 200>;
