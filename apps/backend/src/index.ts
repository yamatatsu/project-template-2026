import { serve } from '@hono/node-server';
import { loadAuthConfigFromEnv } from '@icasu/backend-auth';

import { type AppType, createApp } from './app.ts';

export type { AppType };

// auth 設定全体を起動時に一括検証する。env の不足は最初の認証リクエスト時ではなく、
// ここで（不足の一覧付きで）クラッシュさせる。
const app = createApp({ auth: loadAuthConfigFromEnv() });
export { app };

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
