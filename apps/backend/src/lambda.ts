import { loadAuthConfigFromEnv } from '@icasu/backend-auth';
import { handle } from 'hono/aws-lambda';

import { createApp } from './app.ts';

/**
 * AWS Lambda（API Gateway HTTP API、ペイロードフォーマット 2.0）のエントリポイント。
 * Node 版（`index.ts`）とまったく同じ Hono アプリを構築する。
 */
const app = createApp({ auth: loadAuthConfigFromEnv() });

export const handler = handle(app);
