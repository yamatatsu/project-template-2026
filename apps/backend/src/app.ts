import { type AuthConfig, createAuth } from '@icasu/backend-auth';
import { getLogger } from '@icasu/logger';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { requestLogger } from './middleware/request-logger.ts';
import me from './routes/me.get.ts';
import taskDelete from './routes/tasks.$taskId.delete.ts';
import taskGet from './routes/tasks.$taskId.get.ts';
import taskPut from './routes/tasks.$taskId.put.ts';
import taskList from './routes/tasks.list.ts';
import taskPost from './routes/tasks.post.ts';
import userGet from './routes/users.$userId.get.ts';
import userPut from './routes/users.$userId.put.ts';
import userList from './routes/users.list.ts';

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
    .route('/', taskDelete)
    .route('/', userList)
    .route('/', userGet)
    .route('/', userPut);

  // requestLogger は最外周に置く。/auth 配下（認証イベントの発生源）まで含めて
  // リクエストスコープと requestId を行き渡らせるため。
  //
  // CORS ミドルウェアは置かない。SPA と BFF は常に同一オリジンで配信される（dev は Vite プロキシ、
  // 本番は CloudFront が /api を同居させる）ため CORS 自体が発生しない。クロスオリジン配信に変える
  // 場合は、Cookie 認証なので origin の明示 + credentials 対応が必須（ワイルドカードは不可）。
  return new Hono()
    .use('*', requestLogger())
    .route('/auth', auth.navRoute)
    .route('/', applicationRoutes)
    .onError((err, c) => {
      // HTTPException は「throw が I/F」の経路で運ばれてきた意図されたレスポンスなのでそのまま返す。
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      // Hono 既定の onError は console.error に生のスタックを吐き、requestId 付きの構造化ログから
      // 外れる。onError はリクエストスコープの内側で呼ばれる（Hono が最内周の dispatch で捕まえる）
      // ため、getLogger() で相関キー付きのエラーログを残せる（docs/specs/logs.md）。
      // レスポンス本文にはエラーの内訳を漏らさない。
      getLogger().error('unhandled error', err);
      return c.json({ error: 'internal server error' }, 500);
    });
}

export type AppType = ReturnType<typeof createApp>;
