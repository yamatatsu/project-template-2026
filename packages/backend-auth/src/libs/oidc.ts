import { getAuthConfig } from './config.ts';

/** Tokens returned by the provider's token endpoint. */
export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly idToken: string;
  /** Access-token lifetime in seconds. */
  readonly expiresIn: number;
}

/** Error from the token endpoint; `isInvalidGrant` flags an unusable refresh token. */
export class TokenError extends Error {
  readonly status: number;
  readonly body: string;

  // Note: explicit field assignment (not constructor parameter properties),
  // since Node's strip-only TypeScript execution does not support the latter.
  constructor(status: number, body: string) {
    super(`Token endpoint error (${status}): ${body}`);
    this.name = 'TokenError';
    this.status = status;
    this.body = body;
  }

  get isInvalidGrant(): boolean {
    return this.body.includes('invalid_grant');
  }
}

/** Build the provider `/authorize` redirect URL (authorization code + PKCE). */
export function buildAuthorizeUrl(params: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const cfg = getAuthConfig();
  const url = new URL(cfg.oidc.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.oidc.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.oidc.scopes);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** Exchange an authorization code for tokens (with the PKCE verifier). */
export function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const cfg = getAuthConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: codeVerifier,
    }),
  );
}

/** Exchange a refresh token for a fresh token set. */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
}

/** Build the provider logout URL (`{redirect}` replaced with the app base URL). */
export function buildLogoutUrl(): string {
  const cfg = getAuthConfig();
  return cfg.logoutUrl.replace('{redirect}', encodeURIComponent(cfg.appBaseUrl));
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const cfg = getAuthConfig();
  // Confidential client: authenticate with HTTP Basic (client_id:client_secret).
  const basic = Buffer.from(`${cfg.oidc.clientId}:${cfg.oidc.clientSecret}`).toString('base64');
  const res = await fetch(cfg.oidc.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basic}`,
    },
    body,
  });

  if (!res.ok) {
    throw new TokenError(res.status, await res.text());
  }

  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresIn: json.expires_in,
  };
}
