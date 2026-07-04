import { createHash, randomBytes } from 'node:crypto';

/**
 * PKCE / 不透明トークンのヘルパー。
 *
 * すべての値は 32 バイトの乱数を base64url でエンコードしたもの。PKCE の challenge は
 * RFC 7636 に従い verifier の S256 ハッシュ。
 */
function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** PKCE の `code_verifier`。 */
export function generateVerifier(): string {
  return randomToken();
}

/** verifier から導出した PKCE の `code_challenge`（S256）。 */
export function challengeFromVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** OAuth の `state`（CSRF 対策）。 */
export function generateState(): string {
  return randomToken();
}

/** OIDC の `nonce`（リプレイ対策。id_token に紐付けられる）。 */
export function generateNonce(): string {
  return randomToken();
}

/** Cookie に保存する不透明な session id。ブラウザが目にする唯一のトークン。 */
export function generateSessionId(): string {
  return randomToken();
}
