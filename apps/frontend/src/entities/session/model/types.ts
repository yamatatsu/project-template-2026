import type { InferResponseType } from 'hono/client';

import type { client } from '@/shared/api';

/** BFF の `GET /auth/me` エンドポイントが返す、現在のユーザー。 */
export type SessionUser = InferResponseType<typeof client.auth.me.$get, 200>;
