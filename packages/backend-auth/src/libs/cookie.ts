import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

import type { AuthConfig } from './config.ts';
import { SESSION_LIFETIME_SECONDS } from './session-lifetime.ts';

/** Cookie 設定に束縛された、署名付きセッション Cookie のヘルパー。 */
export interface Cookies {
  setSessionCookie(c: Context, sessionId: string): Promise<void>;
  /** 署名付き session id を読み取り検証する。存在しない／改竄されている場合は `undefined`。 */
  readSessionCookie(c: Context): Promise<string | undefined>;
  clearSessionCookie(c: Context): void;
}

/**
 * セッション Cookie のヘルパーを組み立てる。
 *
 * Cookie が持つのは不透明な署名付き session id のみで、トークンは決して載せない。BFF の
 * セキュリティプロファイル（draft-ietf-oauth-browser-based-apps §6.1.3.2）に従う:
 * HttpOnly、Secure（本番）、SameSite=Strict、Path=/、Domain 属性なし、そして `__Host-`
 * 名前プレフィックス（本番。`COOKIE_NAME`/`COOKIE_SECURE` を参照）。
 *
 * ここで SameSite=Strict にしても安全な理由: この Cookie が送られるのは同一オリジンの
 * SPA→BFF リクエスト（API 呼び出しとログアウトのナビゲーション）だけで、クロスサイトの
 * IdP→/auth/callback リダイレクトの時点ではまだ存在しない — callback が発行するのだから、
 * Strict がログインフローを妨げることはない。
 */
export function createCookies(cfg: AuthConfig['cookie']): Cookies {
  return {
    async setSessionCookie(c, sessionId) {
      await setSignedCookie(c, cfg.name, sessionId, cfg.secret, {
        httpOnly: true,
        secure: cfg.secure,
        sameSite: 'Strict',
        path: '/',
        // セッション本体（DynamoDB の TTL）と同じ絶対寿命。Cookie だけ長い/短いという非対称を作らない。
        maxAge: SESSION_LIFETIME_SECONDS,
      });
    },
    async readSessionCookie(c) {
      const value = await getSignedCookie(c, cfg.secret, cfg.name);
      return value === false ? undefined : value;
    },
    clearSessionCookie(c) {
      // `__Host-` プレフィックス付きの Cookie は削除（= maxAge:0 の Set-Cookie）でも
      // Secure 属性が必須。hono は名前を見て検証し、secure を渡さないと throw するため、
      // set 側と同じく cfg.secure を渡す（本番の `__Host-sid` で 500 になるのを防ぐ）。
      deleteCookie(c, cfg.name, { path: '/', secure: cfg.secure });
    },
  };
}
