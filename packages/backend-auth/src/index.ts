import { type AuthConfig } from './libs/config.ts';
/**
 * `@icasu/backend-auth` — BFF（Backend-For-Frontend）認証機能。
 *
 * `createAuth(config)` は注入された `AuthConfig` から、自己完結した BFF 認証部品一式を
 * 組み立てる:
 *  - `navRoute`: OIDC authorization-code + PKCE の**ブラウザ遷移**（login / callback / logout）
 *    を実装する Hono app。ホストが `/auth` にマウントする;
 *  - `requireSession`: ホスト自身のルートを保護するミドルウェア。
 *
 * 「現在のユーザー」を返す JSON API（`/me`）はホスト（apps/backend）が所有する。permissions など
 * app 固有の情報を載せるため、identity までしか持たないこのパッケージには置かない。
 *
 * 設定は注入で受け取る（パッケージ内で `process.env` を読まない）。これにより配線が明示的
 * かつ型チェック可能になり、ホストは起動時に `loadAuthConfigFromEnv` で一括検証できる —
 * `apps/backend` を参照。
 */
import { createCookies } from './libs/cookie.ts';
import { createIdTokenVerifier } from './libs/jwks.ts';
import { createOidcClient } from './libs/oidc.ts';
import { createSessionStore } from './libs/session.ts';
import { createRequireSession } from './middleware.ts';
import { createAuthRoute } from './route.ts';

export { type AuthConfig, loadAuthConfigFromEnv } from './libs/config.ts';
export { type AuthEnv, type RequireSession, type SessionContext } from './middleware.ts';

/** 注入された設定から BFF 認証部品を配線する。 */
export function createAuth(config: AuthConfig) {
  const cookies = createCookies(config.cookie);
  const store = createSessionStore(config.dynamo);
  const oidc = createOidcClient(config);
  const verifier = createIdTokenVerifier(config.oidc);
  const requireSession = createRequireSession({ cookies, store, oidc });
  const navRoute = createAuthRoute({ cookies, store, oidc, verifier });
  return { navRoute, requireSession };
}
