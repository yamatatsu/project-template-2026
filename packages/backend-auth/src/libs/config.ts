/**
 * Auth configuration.
 *
 * The BFF is implemented against the generic OIDC authorization-code + PKCE
 * flow, so the same code runs against Cognito (prod) and mock-oauth2-server
 * (local) — only the `AuthConfig` values differ.
 *
 * The package never reads `process.env` on its own: the host builds an
 * `AuthConfig` (typically via `loadAuthConfigFromEnv`) and injects it through
 * `createAuth`. This makes the dependency explicit — the host cannot forget to
 * wire it (compile error) — and lets the host validate the whole config once,
 * at startup, instead of failing on the first request.
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

/**
 * Build an `AuthConfig` from environment variables, validating up front.
 *
 * Every missing required variable is collected and reported together, so the
 * host (which should call this at startup — see `apps/backend`) fails fast with
 * the complete list instead of one-var-at-a-time on the first request.
 */
export function loadAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const missing: string[] = [];
  const required = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === '') {
      missing.push(name);
      return '';
    }
    return value;
  };
  const optional = (name: string, fallback: string): string => {
    const value = env[name];
    return value === undefined || value === '' ? fallback : value;
  };

  const config: AuthConfig = {
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
      endpoint: env.DYNAMODB_ENDPOINT || undefined,
      region: optional('AWS_REGION', 'ap-northeast-1'),
    },
  };

  if (missing.length > 0) {
    throw new Error(
      `@icasu/backend-auth: missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return config;
}
