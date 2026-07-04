import type { AuthConfig } from './config.ts';

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

export interface OidcClient {
  /** Build the provider `/authorize` redirect URL (authorization code + PKCE). */
  buildAuthorizeUrl(params: { state: string; nonce: string; codeChallenge: string }): string;
  /** Exchange an authorization code for tokens (with the PKCE verifier). */
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  /** Exchange a refresh token for a fresh token set. */
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  /** Build the provider logout URL (`{redirect}` replaced with the app base URL). */
  buildLogoutUrl(): string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
}

/** Build the OIDC client bound to the provider config. */
export function createOidcClient(cfg: AuthConfig): OidcClient {
  const { oidc } = cfg;

  async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
    // Confidential client: authenticate with HTTP Basic (client_id:client_secret).
    const basic = Buffer.from(`${oidc.clientId}:${oidc.clientSecret}`).toString('base64');
    const res = await fetch(oidc.tokenUrl, {
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

  return {
    buildAuthorizeUrl(params) {
      const url = new URL(oidc.authorizeUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', oidc.clientId);
      url.searchParams.set('redirect_uri', cfg.redirectUri);
      url.searchParams.set('scope', oidc.scopes);
      url.searchParams.set('state', params.state);
      url.searchParams.set('nonce', params.nonce);
      url.searchParams.set('code_challenge', params.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    },
    exchangeCode(code, codeVerifier) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.redirectUri,
          code_verifier: codeVerifier,
        }),
      );
    },
    refreshTokens(refreshToken) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );
    },
    buildLogoutUrl() {
      return cfg.logoutUrl.replace('{redirect}', encodeURIComponent(cfg.appBaseUrl));
    },
  };
}
