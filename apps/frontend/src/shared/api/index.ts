import type { AppType } from '@icasu/backend';
import { hc } from 'hono/client';

/**
 * 型付き Hono RPC クライアント。
 *
 * `AppType` を backend ワークスペースから import しているため、すべてのルートと
 * レスポンスがエンドツーエンドで型付けされる。開発時のリクエストは `/api` に送られ、
 * Vite がバックエンドへプロキシする（`vite.config.ts` を参照）。
 */
const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

// `credentials: 'include'` は、BFF のセッション Cookie をすべての API 呼び出しに
// 同送する（かつ Set-Cookie を保存する）ため。ブラウザがトークンを目にすることはなく、
// 持つのは backend が発行する不透明な HttpOnly セッション Cookie だけ。
export const client = hc<AppType>(baseUrl, {
  init: { credentials: 'include' },
});
