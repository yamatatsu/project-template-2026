import { appendRequestKeys } from '@icasu/logger';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

import { auditAuth } from './audit.ts';
import type { Cookies } from './libs/cookie.ts';
import { type OidcClient, TokenError } from './libs/oidc.ts';
import type { SessionData, SessionStore } from './libs/session.ts';

/** `c.get('session')` でハンドラに公開する認証済みユーザー情報。 */
export interface SessionContext {
  readonly sessionId: string;
  readonly userSub: string;
  readonly email: string | undefined;
}

/** 保護ルート向けにセッションを運ぶ Hono の env。 */
export interface AuthEnv {
  Variables: { session: SessionContext };
}

/** `createRequireSession` が生成するミドルウェア。ホストが注入する型でもある。 */
export type RequireSession = MiddlewareHandler<AuthEnv>;

/** `requireSession` が必要とする依存。 */
export interface RequireSessionDeps {
  cookies: Cookies;
  store: SessionStore;
  oidc: Pick<OidcClient, 'refreshTokens'>;
}

/** 実際の失効よりどれだけ手前（秒）で先回りしてリフレッシュするかのマージン。 */
const REFRESH_MARGIN_SECONDS = 60;

/**
 * ルートグループを保護するミドルウェアを組み立てる: 有効なセッション Cookie を要求し、
 * アクセストークンが失効間近なら（ローテーション込みで）透過的にリフレッシュする。
 * 使えるセッションが無ければ 401 `{ error: 'unauthenticated' }` を返す。
 */
export function createRequireSession(deps: RequireSessionDeps): RequireSession {
  const { cookies, store, oidc } = deps;

  /** セッションを破棄する。不正アクセスの兆候になりうるので理由付きで監査に残す。 */
  async function invalidate(
    c: Context<AuthEnv>,
    sessionId: string,
    reason: string,
    userSub: string,
  ): Promise<void> {
    await store.deleteSession(sessionId);
    cookies.clearSessionCookie(c);
    auditAuth('auth.session.invalidated', { outcome: 'failure', reason, actor: { userSub } });
  }

  async function tryRefresh(
    c: Context<AuthEnv>,
    sessionId: string,
    session: SessionData,
  ): Promise<SessionData | undefined> {
    if (!session.refreshToken) {
      await invalidate(c, sessionId, 'no-refresh-token', session.userSub);
      return undefined;
    }
    try {
      const tokens = await oidc.refreshTokens(session.refreshToken);
      const updated: SessionData = {
        ...session,
        accessToken: tokens.accessToken,
        // リフレッシュトークンのローテーション: プロバイダが新しいものを発行したらそれを保持する。
        refreshToken: tokens.refreshToken ?? session.refreshToken,
        idToken: tokens.idToken,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
      };
      await store.saveSession(sessionId, updated);
      return updated;
    } catch (err) {
      if (err instanceof TokenError && err.isInvalidGrant) {
        await invalidate(c, sessionId, 'refresh-token-rejected', session.userSub);
        return undefined;
      }
      throw err;
    }
  }

  return createMiddleware<AuthEnv>(async (c, next) => {
    const sessionId = await cookies.readSessionCookie(c);
    if (!sessionId) {
      // Cookie が無いのはログイン前の正常な状態。全訪問者が踏むので監査には残さない
      // （401 自体はアクセスログの status から追える）。
      return c.json({ error: 'unauthenticated' }, 401);
    }

    let session = await store.getSession(sessionId);
    if (!session) {
      // Cookie はあるのに裏のセッションが無い＝失効か改竄。actor を特定できないので載せない。
      cookies.clearSessionCookie(c);
      auditAuth('auth.session.invalidated', { outcome: 'failure', reason: 'session-not-found' });
      return c.json({ error: 'unauthenticated' }, 401);
    }

    if (session.accessTokenExpiresAt - REFRESH_MARGIN_SECONDS <= Math.floor(Date.now() / 1000)) {
      const refreshed = await tryRefresh(c, sessionId, session);
      if (!refreshed) {
        return c.json({ error: 'unauthenticated' }, 401);
      }
      session = refreshed;
    }

    // 以降このリクエストの全ログ（アクセス・監査・診断）に actor が載る。
    appendRequestKeys({ userSub: session.userSub });

    c.set('session', { sessionId, userSub: session.userSub, email: session.email });
    await next();
  });
}
