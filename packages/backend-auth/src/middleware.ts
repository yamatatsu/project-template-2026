import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { clearSessionCookie, readSessionCookie } from './libs/cookie.ts';
import { refreshTokens, TokenError } from './libs/oidc.ts';
import { deleteSession, getSession, saveSession, type SessionData } from './libs/session.ts';

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

/** Margin (seconds) before real expiry at which we proactively refresh. */
const REFRESH_MARGIN_SECONDS = 60;

/**
 * Protect a route group: require a valid session cookie, transparently
 * refreshing the access token (with rotation) when it is about to expire.
 * Responds 401 `{ error: 'unauthenticated' }` when there is no usable session.
 */
export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  const sessionId = await readSessionCookie(c);
  if (!sessionId) {
    return c.json({ error: 'unauthenticated' }, 401);
  }

  let session = await getSession(sessionId);
  if (!session) {
    clearSessionCookie(c);
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
    const tokens = await refreshTokens(session.refreshToken);
    const updated: SessionData = {
      ...session,
      accessToken: tokens.accessToken,
      // Refresh-token rotation: keep the new one if the provider issued it.
      refreshToken: tokens.refreshToken ?? session.refreshToken,
      idToken: tokens.idToken,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
    };
    await saveSession(sessionId, updated);
    return updated;
  } catch (err) {
    if (err instanceof TokenError && err.isInvalidGrant) {
      await invalidate(c, sessionId);
      return undefined;
    }
    throw err;
  }
}

async function invalidate(c: Context<AuthEnv>, sessionId: string): Promise<void> {
  await deleteSession(sessionId);
  clearSessionCookie(c);
}
