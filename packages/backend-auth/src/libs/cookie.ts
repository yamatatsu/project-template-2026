import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

import type { AuthConfig } from './config.ts';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Signed session-cookie helpers, bound to the cookie config. */
export interface Cookies {
  setSessionCookie(c: Context, sessionId: string): Promise<void>;
  /** Read and verify the signed session id, or `undefined` if absent/tampered. */
  readSessionCookie(c: Context): Promise<string | undefined>;
  clearSessionCookie(c: Context): void;
}

/**
 * Build the session cookie helpers.
 *
 * The cookie holds only an opaque, signed session id — never a token. It follows
 * the BFF security profile (draft-ietf-oauth-browser-based-apps §6.1.3.2):
 * HttpOnly, Secure (production), SameSite=Strict, Path=/, no Domain attribute,
 * and a `__Host-` name prefix (production; see `COOKIE_NAME`/`COOKIE_SECURE`).
 *
 * SameSite=Strict is safe here: the cookie is only sent on same-origin SPA→BFF
 * requests (API calls and the logout navigation). It does not yet exist during
 * the cross-site IdP→/auth/callback redirect — the callback issues it — so
 * Strict never blocks the login flow.
 */
export function createCookies(cfg: AuthConfig['cookie']): Cookies {
  return {
    async setSessionCookie(c, sessionId) {
      await setSignedCookie(c, cfg.name, sessionId, cfg.secret, {
        httpOnly: true,
        secure: cfg.secure,
        sameSite: 'Strict',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    },
    async readSessionCookie(c) {
      const value = await getSignedCookie(c, cfg.secret, cfg.name);
      return value === false ? undefined : value;
    },
    clearSessionCookie(c) {
      deleteCookie(c, cfg.name, { path: '/' });
    },
  };
}
