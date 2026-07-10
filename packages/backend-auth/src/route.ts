import { Hono } from 'hono';

import { auditAuth } from './audit.ts';
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
import { type AuthEnv } from './middleware.ts';

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
 * 「現在のユーザー」を返す JSON API（`/me`）はホスト（apps/backend）が所有する
 * （permissions など app 固有の情報を載せるため。`requireSession` を再利用して保護する）。
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
        auditAuth('auth.login.failed', { outcome: 'failure', reason: 'missing-code-or-state' });
        return c.json({ error: 'invalid_request' }, 400);
      }
      const pending = await store.consumeState(state);
      if (!pending) {
        auditAuth('auth.login.failed', { outcome: 'failure', reason: 'unknown-state' });
        return c.json({ error: 'invalid_state' }, 400);
      }

      // 監査のために失敗を捉えるだけで、握り潰さず再 throw する（HTTP の結果は変えない）。
      const tokens = await oidc.exchangeCode(code, pending.codeVerifier).catch((err: unknown) => {
        auditAuth('auth.login.failed', { outcome: 'failure', reason: 'token-exchange-failed' });
        throw err;
      });
      const claims = await verifier
        .verifyIdToken(tokens.idToken, pending.nonce)
        .catch((err: unknown) => {
          auditAuth('auth.login.failed', {
            outcome: 'failure',
            reason: 'id-token-verification-failed',
          });
          throw err;
        });

      const userSub = String(claims.sub);
      const sessionId = generateSessionId();
      await store.saveSession(sessionId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        userSub,
        email: typeof claims.email === 'string' ? claims.email : undefined,
      });
      await cookies.setSessionCookie(c, sessionId);
      auditAuth('auth.login.succeeded', { actor: { userSub } });

      return c.redirect(safeReturnPath(pending.returnTo));
    })
    .get('/logout', async (c) => {
      const sessionId = await cookies.readSessionCookie(c);
      // RP-initiated logout の id_token_hint 用に、セッション削除前に id_token を控える。
      // プロバイダ（Duende 等）はこれで post_logout_redirect_uri を検証し、アプリへ戻す。
      let idToken: string | undefined;
      let userSub: string | undefined;
      if (sessionId) {
        const session = await store.getSession(sessionId);
        idToken = session?.idToken;
        userSub = session?.userSub;
        await store.deleteSession(sessionId);
      }
      cookies.clearSessionCookie(c);
      auditAuth('auth.logout', { actor: userSub ? { userSub } : undefined });
      return c.redirect(oidc.buildLogoutUrl(idToken));
    });
}

/**
 * ログイン後の遷移先として、同一オリジンのパスだけを通す（open-redirect ガード）。
 * 先頭が `/` かどうかだけでは不十分 —— `//evil.com` はスキーム相対の絶対 URL として、
 * `/\evil.com` はブラウザが `\` を `/` に正規化して、どちらも外部サイトへ遷移してしまう。
 */
function safeReturnPath(returnTo: string): string {
  const isSameOriginPath =
    returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/\\');
  return isSameOriginPath ? returnTo : '/';
}
