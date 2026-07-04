/**
 * Auth configuration, read from environment variables.
 *
 * The BFF is implemented against the generic OIDC authorization-code + PKCE
 * flow, so the same code runs against Cognito (prod) and mock-oauth2-server
 * (local) — only these env values differ. See `.env.example`.
 *
 * Loaded lazily (and cached) so importing this module never throws at load
 * time; tests can set env before the first `getAuthConfig()` call.
 */
export interface AuthConfig {
  readonly oidc: {
    readonly issuer: string;
    readonly authorizeUrl: string;
    readonly tokenUrl: string;
    readonly jwksUrl: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly scopes: string;
  };
  /** Redirect URI registered with the provider (BFF `/auth/callback`). */
  readonly redirectUri: string;
  /** Logout URL template; `{redirect}` is replaced with the app base URL. */
  readonly logoutUrl: string;
  /** Where the SPA lives; users land here after login/logout. */
  readonly appBaseUrl: string;
  readonly cookie: {
    readonly name: string;
    readonly secure: boolean;
    readonly secret: string;
  };
  readonly dynamo: {
    readonly tableName: string;
    /** Set for DynamoDB Local; unset (undefined) in production. */
    readonly endpoint: string | undefined;
    readonly region: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

let cached: AuthConfig | undefined;

export function getAuthConfig(): AuthConfig {
  if (cached) return cached;

  cached = {
    oidc: {
      issuer: required('OIDC_ISSUER'),
      authorizeUrl: required('OIDC_AUTHORIZE_URL'),
      tokenUrl: required('OIDC_TOKEN_URL'),
      jwksUrl: required('OIDC_JWKS_URL'),
      clientId: required('OIDC_CLIENT_ID'),
      clientSecret: required('OIDC_CLIENT_SECRET'),
      scopes: optional('OIDC_SCOPES', 'openid email profile'),
    },
    redirectUri: required('AUTH_REDIRECT_URI'),
    logoutUrl: required('AUTH_LOGOUT_URL'),
    appBaseUrl: required('APP_BASE_URL'),
    cookie: {
      name: optional('COOKIE_NAME', 'sid'),
      secure: optional('COOKIE_SECURE', 'true') === 'true',
      secret: required('COOKIE_SECRET'),
    },
    dynamo: {
      tableName: required('SESSION_TABLE_NAME'),
      endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
      region: optional('AWS_REGION', 'ap-northeast-1'),
    },
  };

  return cached;
}

/** Test helper: clear the cached config so the next call re-reads env. */
export function resetAuthConfig(): void {
  cached = undefined;
}
