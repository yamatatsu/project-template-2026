import { Hono } from 'hono';

import { clearSessionCookie, readSessionCookie, setSessionCookie } from './libs/cookie.ts';
import { verifyIdToken } from './libs/jwks.ts';
import { buildAuthorizeUrl, buildLogoutUrl, exchangeCode } from './libs/oidc.ts';
import {
  challengeFromVerifier,
  generateNonce,
  generateSessionId,
  generateState,
  generateVerifier,
} from './libs/pkce.ts';
import { consumeState, deleteSession, saveSession, saveState } from './libs/session.ts';
import { type AuthEnv, requireSession } from './middleware.ts';

/**
 * BFF auth routes.
 *
 * Defined with method chaining so the inferred type flows to the frontend via
 * the Hono RPC client. Only `/me` is meant to be called from the RPC client;
 * `/login`, `/callback`, `/logout` are full-page redirects.
 */
export const authRoute = new Hono<AuthEnv>()
  .get('/login', async (c) => {
    const verifier = generateVerifier();
    const state = generateState();
    const nonce = generateNonce();
    const returnTo = c.req.query('returnTo') ?? '/';
    await saveState(state, { codeVerifier: verifier, nonce, returnTo });
    return c.redirect(
      buildAuthorizeUrl({ state, nonce, codeChallenge: challengeFromVerifier(verifier) }),
    );
  })
  .get('/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const pending = await consumeState(state);
    if (!pending) {
      return c.json({ error: 'invalid_state' }, 400);
    }

    const tokens = await exchangeCode(code, pending.codeVerifier);
    const claims = await verifyIdToken(tokens.idToken, pending.nonce);

    const sessionId = generateSessionId();
    await saveSession(sessionId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
      userSub: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email : undefined,
    });
    await setSessionCookie(c, sessionId);

    // Only allow same-origin paths as the post-login destination.
    const dest = pending.returnTo.startsWith('/') ? pending.returnTo : '/';
    return c.redirect(dest);
  })
  .get('/logout', async (c) => {
    const sessionId = await readSessionCookie(c);
    if (sessionId) {
      await deleteSession(sessionId);
    }
    clearSessionCookie(c);
    return c.redirect(buildLogoutUrl());
  })
  .get('/me', requireSession, (c) => {
    const session = c.get('session');
    return c.json({ userSub: session.userSub, email: session.email });
  });
