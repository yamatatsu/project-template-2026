import { Hono } from 'hono';

import type { Cookies } from './libs/cookie.ts';
import type { IdTokenVerifier } from './libs/jwks.ts';
import type { OidcClient } from './libs/oidc.ts';
import {
  challengeFromVerifier,
  generateNonce,
  generateSessionId,
  generateState,
  generateVerifier,
} from './libs/pkce.ts';
import type { SessionStore } from './libs/session.ts';
import { type AuthEnv, type RequireSession } from './middleware.ts';

/** 認証（OAuth 遷移）ルートが必要とする依存。 */
export interface AuthRouteDeps {
  cookies: Cookies;
  store: SessionStore;
  oidc: OidcClient;
  verifier: IdTokenVerifier;
}

/**
 * BFF の OAuth 遷移ルート（`/login`・`/callback`・`/logout`）を組み立てる。
 *
 * ここはすべて**ブラウザのフルページ遷移**専用で、RPC クライアントからは呼ばない
 * （`/callback` は IdP に登録する redirect_uri）。ホストは `/auth` にマウントする。
 * 一方「現在のユーザー」を返す JSON API は {@link createMeRoute} 側に分離し、`/api` 配下で
 * 配信する（RPC の型連携に載せるのはこちらだけ）。
 *
 * 推論された型が Hono RPC クライアント経由でフロントエンドに流れるよう、メソッドチェーンで
 * 定義する。
 */
export function createAuthRoute(deps: AuthRouteDeps) {
  const { cookies, store, oidc, verifier } = deps;

  return new Hono<AuthEnv>()
    .get('/login', async (c) => {
      const codeVerifier = generateVerifier();
      const state = generateState();
      const nonce = generateNonce();
      const returnTo = c.req.query('returnTo') ?? '/';
      await store.saveState(state, { codeVerifier, nonce, returnTo });
      return c.redirect(
        oidc.buildAuthorizeUrl({
          state,
          nonce,
          codeChallenge: challengeFromVerifier(codeVerifier),
        }),
      );
    })
    .get('/callback', async (c) => {
      const code = c.req.query('code');
      const state = c.req.query('state');
      if (!code || !state) {
        return c.json({ error: 'invalid_request' }, 400);
      }
      const pending = await store.consumeState(state);
      if (!pending) {
        return c.json({ error: 'invalid_state' }, 400);
      }

      const tokens = await oidc.exchangeCode(code, pending.codeVerifier);
      const claims = await verifier.verifyIdToken(tokens.idToken, pending.nonce);

      const sessionId = generateSessionId();
      await store.saveSession(sessionId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        userSub: String(claims.sub),
        email: typeof claims.email === 'string' ? claims.email : undefined,
      });
      await cookies.setSessionCookie(c, sessionId);

      // ログイン後の遷移先として許可するのは同一オリジンのパスのみ。
      const dest = pending.returnTo.startsWith('/') ? pending.returnTo : '/';
      return c.redirect(dest);
    })
    .get('/logout', async (c) => {
      const sessionId = await cookies.readSessionCookie(c);
      // RP-initiated logout の id_token_hint 用に、セッション削除前に id_token を控える。
      // プロバイダ（Duende 等）はこれで post_logout_redirect_uri を検証し、アプリへ戻す。
      let idToken: string | undefined;
      if (sessionId) {
        idToken = (await store.getSession(sessionId))?.idToken;
        await store.deleteSession(sessionId);
      }
      cookies.clearSessionCookie(c);
      return c.redirect(oidc.buildLogoutUrl(idToken));
    });
}

/**
 * 「現在のユーザー」を返す JSON API（`GET /me`）を組み立てる。
 *
 * OAuth 遷移（{@link createAuthRoute}）とは性質が異なり、これは RPC クライアント／
 * TanStack Query が fetch で叩く純粋な JSON API。そのためリダイレクト系とは別ルートにして
 * `/api` 配下（`/api/me`）で配信し、`AppType` 経由の型連携に載せる。
 */
export function createMeRoute(deps: { requireSession: RequireSession }) {
  const { requireSession } = deps;

  return new Hono<AuthEnv>().get('/', requireSession, (c) => {
    const session = c.get('session');
    return c.json({ userSub: session.userSub, email: session.email });
  });
}
