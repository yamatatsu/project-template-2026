import type { InferResponseType } from 'hono/client';

import type { client } from '@/shared/api';

/** BFF の `GET /api/me` エンドポイントが返す、現在のユーザー。 */
export type SessionUser = InferResponseType<typeof client.me.$get, 200>;

/**
 * ユーザーが持ちうる permission（action）。値集合の真実源はサーバ側の RBAC ポリシーで、
 * ここは RPC レスポンスから型として取り出すだけ（backend 内部を runtime import しない方針）。
 */
export type Permission = SessionUser['permissions'][number];
