/**
 * 認証の設定。
 *
 * BFF は汎用の OIDC authorization-code + PKCE フローに対して実装しているため、同じコードが
 * Cognito（本番）と mock-oauth2-server（ローカル）の両方で動く — 違うのは `AuthConfig` の
 * 値だけ。
 *
 * このパッケージは自分では一切 `process.env` を読まない: ホストが `AuthConfig` を組み立て
 * （通常は `loadAuthConfigFromEnv` 経由）、`createAuth` を通して注入する。これで依存が明示的
 * になり — ホストは配線を忘れられない（コンパイルエラーになる）—、初回リクエストで失敗する
 * のではなく起動時に設定全体を一度で検証できる。
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
  /** プロバイダに登録済みの redirect URI（BFF の `/auth/callback`）。 */
  readonly redirectUri: string;
  /** ログアウト URL のテンプレート。`{redirect}` はアプリのベース URL に置換される。 */
  readonly logoutUrl: string;
  /** SPA の場所。ログイン／ログアウト後にユーザーはここへ戻る。 */
  readonly appBaseUrl: string;
  readonly cookie: {
    readonly name: string;
    readonly secure: boolean;
    readonly secret: string;
  };
  readonly dynamo: {
    readonly tableName: string;
    /** DynamoDB Local 用に設定する。本番では未設定（undefined）。 */
    readonly endpoint: string | undefined;
    readonly region: string;
  };
}

/**
 * 環境変数から `AuthConfig` を組み立て、その場で検証する。
 *
 * 不足している必須変数はすべて集めてまとめて報告する。これによりホスト（起動時に呼ぶ想定 —
 * `apps/backend` を参照）は、初回リクエストで1変数ずつ失敗するのではなく、完全な一覧付きで
 * fail fast できる。
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
