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

/** Dependencies the auth routes need. */
export interface AuthRouteDeps {
  cookies: Cookies;
  store: SessionStore;
  oidc: OidcClient;
  verifier: IdTokenVerifier;
  requireSession: RequireSession;
}

/**
 * Build the BFF auth routes.
 *
 * Defined with method chaining so the inferred type flows to the frontend via
 * the Hono RPC client. Only `/me` is meant to be called from the RPC client;
 * `/login`, `/callback`, `/logout` are full-page redirects.
 */
export function createAuthRoute(deps: AuthRouteDeps) {
  const { cookies, store, oidc, verifier, requireSession } = deps;

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

      // Only allow same-origin paths as the post-login destination.
      const dest = pending.returnTo.startsWith('/') ? pending.returnTo : '/';
      return c.redirect(dest);
    })
    .get('/logout', async (c) => {
      const sessionId = await cookies.readSessionCookie(c);
      if (sessionId) {
        await store.deleteSession(sessionId);
      }
      cookies.clearSessionCookie(c);
      return c.redirect(oidc.buildLogoutUrl());
    })
    .get('/me', requireSession, (c) => {
      const session = c.get('session');
      return c.json({ userSub: session.userSub, email: session.email });
    });
}
