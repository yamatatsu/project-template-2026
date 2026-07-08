import { type AuthConfig, createAuth } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import taskDelete from './routes/tasks.$taskId.delete.ts';
import taskGet from './routes/tasks.$taskId.get.ts';
import taskPut from './routes/tasks.$taskId.put.ts';
import taskList from './routes/tasks.list.ts';
import taskPost from './routes/tasks.post.ts';

/** アプリの構築に必要なものすべて。起動時に一度だけ組み立てる。 */
export interface AppConfig {
  auth: AuthConfig;
}

/**
 * Hono アプリケーションを構築する。
 *
 * ルートをメソッドチェーンで定義しているのは、推論型（`AppType`）が Hono RPC クライアント
 * 経由でルート・レスポンスの完全な情報をフロントエンドへ運べるようにするため。
 *
 * ルーティングは「ブラウザのフルページ遷移」と「JSON API」で分ける:
 *  - `/auth/*` … OAuth のブラウザ遷移（login/callback/logout）。CloudFront はここを
 *    プレフィックス除去せずそのまま API へ転送する（redirect_uri を素直な `/auth/callback`
 *    に保つため）。
 *  - `/me`・`/tasks` … RPC/fetch で叩く JSON API。CloudFront では `/api/*` として配信され
 *    （`/api` プレフィックスは除去）、`AppType` 経由でフロントに型連携される。
 *
 * `/me`・`/tasks` は注入されたセッションミドルウェアで保護される。
 */
export function createApp(config: AppConfig) {
  const auth = createAuth(config.auth);

  const applicationRoutes = new Hono()
    .use('*', auth.requireSession)
    .route('/', taskList)
    .route('/', taskGet)
    .route('/', taskPost)
    .route('/', taskPut)
    .route('/', taskDelete);

  return new Hono()
    .use('*', cors())
    .get('/hello-world', (c) => c.json({ message: 'hello world' }))
    .route('/auth', auth.navRoute)
    .route('/me', auth.meRoute)
    .route('/', applicationRoutes);
}

export type AppType = ReturnType<typeof createApp>;
