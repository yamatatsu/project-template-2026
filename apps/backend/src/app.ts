import { type AuthConfig, createAuth } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createTasksRoute } from './tasks/route.ts';

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
 * `/auth/*` は BFF のエンドポイント（login/callback/logout/me）。`/tasks` をはじめとする
 * API ルートは、注入されたセッションミドルウェアで保護される。
 */
export function createApp(config: AppConfig) {
  const auth = createAuth(config.auth);

  return new Hono()
    .use('*', cors())
    .get('/hello-world', (c) => c.json({ message: 'hello world' }))
    .route('/auth', auth.route)
    .route('/tasks', createTasksRoute(auth.requireSession));
}

export type AppType = ReturnType<typeof createApp>;
