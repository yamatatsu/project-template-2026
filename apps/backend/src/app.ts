import { type AuthConfig, createAuth } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import me from './routes/me.get.ts';
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
 * Hono アプリケーションを構築する（合成点）。
 *
 * `/auth/*` はブラウザのフルページ遷移（OAuth の login/callback/logout）、`/me`・`/tasks` は
 * RPC/fetch で叩く JSON API。CloudFront は前者をそのまま、後者を `/api/*`（プレフィックス除去）で
 * 配信するため、redirect_uri を素直な `/auth/callback` に保てる。`/me`・`/tasks` は requireSession
 * で保護する。`/me` は permissions（role 由来の app 固有 RBAC）を返すため backend-auth ではなく
 * apps/backend が所有し、保護グループに同居させる（詳細は apps/backend/CLAUDE.md「認証・認可」）。
 */
export function createApp(config: AppConfig) {
  const auth = createAuth(config.auth);

  const applicationRoutes = new Hono()
    .use('*', auth.requireSession)
    .route('/', me)
    .route('/', taskList)
    .route('/', taskGet)
    .route('/', taskPost)
    .route('/', taskPut)
    .route('/', taskDelete);

  return new Hono().use('*', cors()).route('/auth', auth.navRoute).route('/', applicationRoutes);
}

export type AppType = ReturnType<typeof createApp>;
