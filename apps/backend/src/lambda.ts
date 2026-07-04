import { loadAuthConfigFromEnv } from '@icasu/backend-auth';
import { handle } from 'hono/aws-lambda';

import { createApp } from './app.ts';

/**
 * AWS Lambda（API Gateway HTTP API、ペイロードフォーマット 2.0）のエントリポイント。
 *
 * `index.ts` 経由でローカルの Node 上で動くものとまったく同じ Hono アプリを構築する。
 * auth 設定はコールドスタート時に検証される（`loadAuthConfigFromEnv`）ため、env の不足は
 * 最初の認証リクエスト時ではなく init の時点で失敗する。
 * CloudFront がここへ転送する前に `/api` プレフィックスを剥がすので、ルートはルート直下の
 * まま（`/tasks`、`/hello-world`）でよく、バックエンド側のコード変更は不要。
 */
const app = createApp({ auth: loadAuthConfigFromEnv() });

export const handler = handle(app);
