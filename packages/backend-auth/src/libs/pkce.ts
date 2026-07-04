import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE / opaque-token helpers.
 *
 * All values are 32 random bytes encoded as base64url. The PKCE challenge is
 * the S256 hash of the verifier, per RFC 7636.
 */
function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** PKCE `code_verifier`. */
export function generateVerifier(): string {
  return randomToken();
}

/** PKCE `code_challenge` (S256) derived from a verifier. */
export function challengeFromVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** OAuth `state` (CSRF protection). */
export function generateState(): string {
  return randomToken();
}

/** OIDC `nonce` (replay protection, bound into the id_token). */
export function generateNonce(): string {
  return randomToken();
}

/** Opaque session id stored in the cookie; the only token the browser ever sees. */
export function generateSessionId(): string {
  return randomToken();
}
