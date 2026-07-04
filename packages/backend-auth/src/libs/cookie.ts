import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

import { getAuthConfig } from './config.ts';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Session cookie helpers.
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
export async function setSessionCookie(c: Context, sessionId: string): Promise<void> {
  const cfg = getAuthConfig();
  await setSignedCookie(c, cfg.cookie.name, sessionId, cfg.cookie.secret, {
    httpOnly: true,
    secure: cfg.cookie.secure,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Read and verify the signed session id, or `undefined` if absent/tampered. */
export async function readSessionCookie(c: Context): Promise<string | undefined> {
  const cfg = getAuthConfig();
  const value = await getSignedCookie(c, cfg.cookie.secret, cfg.cookie.name);
  return value === false ? undefined : value;
}

export function clearSessionCookie(c: Context): void {
  clearCookieByName(c);
}

function clearCookieByName(c: Context): void {
  const cfg = getAuthConfig();
  deleteCookie(c, cfg.cookie.name, { path: '/' });
}
