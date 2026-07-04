import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

import type { Cookies } from './libs/cookie.ts';
import { type OidcClient, TokenError } from './libs/oidc.ts';
import type { SessionData, SessionStore } from './libs/session.ts';

/** Authenticated user info exposed to handlers via `c.get('session')`. */
export interface SessionContext {
  readonly sessionId: string;
  readonly userSub: string;
  readonly email: string | undefined;
}

/** Hono env that carries the session for protected routes. */
export interface AuthEnv {
  Variables: { session: SessionContext };
}

/** The middleware `createRequireSession` produces; also the type hosts inject. */
export type RequireSession = MiddlewareHandler<AuthEnv>;

/** Dependencies `requireSession` needs. */
export interface RequireSessionDeps {
  cookies: Cookies;
  store: SessionStore;
  oidc: Pick<OidcClient, 'refreshTokens'>;
}

/** Margin (seconds) before real expiry at which we proactively refresh. */
const REFRESH_MARGIN_SECONDS = 60;

/**
 * Build the middleware that protects a route group: require a valid session
 * cookie, transparently refreshing the access token (with rotation) when it is
 * about to expire. Responds 401 `{ error: 'unauthenticated' }` when there is no
 * usable session.
 */
export function createRequireSession(deps: RequireSessionDeps): RequireSession {
  const { cookies, store, oidc } = deps;

  async function invalidate(c: Context<AuthEnv>, sessionId: string): Promise<void> {
    await store.deleteSession(sessionId);
    cookies.clearSessionCookie(c);
  }

  async function tryRefresh(
    c: Context<AuthEnv>,
    sessionId: string,
    session: SessionData,
  ): Promise<SessionData | undefined> {
    if (!session.refreshToken) {
      await invalidate(c, sessionId);
      return undefined;
    }
    try {
      const tokens = await oidc.refreshTokens(session.refreshToken);
      const updated: SessionData = {
        ...session,
        accessToken: tokens.accessToken,
        // Refresh-token rotation: keep the new one if the provider issued it.
        refreshToken: tokens.refreshToken ?? session.refreshToken,
        idToken: tokens.idToken,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
      };
      await store.saveSession(sessionId, updated);
      return updated;
    } catch (err) {
      if (err instanceof TokenError && err.isInvalidGrant) {
        await invalidate(c, sessionId);
        return undefined;
      }
      throw err;
    }
  }

  return createMiddleware<AuthEnv>(async (c, next) => {
    const sessionId = await cookies.readSessionCookie(c);
    if (!sessionId) {
      return c.json({ error: 'unauthenticated' }, 401);
    }

    let session = await store.getSession(sessionId);
    if (!session) {
      cookies.clearSessionCookie(c);
      return c.json({ error: 'unauthenticated' }, 401);
    }

    if (session.accessTokenExpiresAt - REFRESH_MARGIN_SECONDS <= Math.floor(Date.now() / 1000)) {
      const refreshed = await tryRefresh(c, sessionId, session);
      if (!refreshed) {
        return c.json({ error: 'unauthenticated' }, 401);
      }
      session = refreshed;
    }

    c.set('session', { sessionId, userSub: session.userSub, email: session.email });
    await next();
  });
}
